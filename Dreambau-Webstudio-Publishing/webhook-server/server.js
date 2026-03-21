const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret-here';

app.use(bodyParser.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook endpoint for publish events
app.post('/webhook/publish', async (req, res) => {
  try {
    // Verify webhook secret
    const authHeader = req.headers['x-webhook-secret'];
    if (authHeader !== WEBHOOK_SECRET) {
      console.error('Invalid webhook secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projectId, projectName, buildId } = req.body;

    if (!projectId || !projectName) {
      return res.status(400).json({ error: 'Missing required fields: projectId, projectName' });
    }

    console.log(`[${new Date().toISOString()}] Received publish webhook for project: ${projectName} (${projectId})`);

    // Respond immediately to avoid timeout
    res.json({ 
      status: 'accepted', 
      message: 'Build queued',
      projectId,
      projectName 
    });

    // Trigger build asynchronously
    const buildScript = path.join(__dirname, '..', 'build-script.sh');
    const command = `bash ${buildScript} "${projectId}" "${projectName}" "${buildId || 'latest'}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Build error for ${projectName}:`, error);
        console.error('stderr:', stderr);
        return;
      }
      console.log(`Build completed for ${projectName}:`, stdout);
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Webstudio webhook server listening on port ${PORT}`);
  console.log(`Webhook endpoint: POST /webhook/publish`);
});





