/**
 * Resend API to SMTP Bridge
 * 
 * This service mimics the Resend API but sends emails via SMTP.
 * Perfect for self-hosted setups where you want to use your own email server!
 */

const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// SMTP Configuration from environment
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.titan.email',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false // For self-signed certificates
  }
});

// Verify SMTP connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ SMTP connection failed:', error);
  } else {
    console.log('✅ SMTP server is ready to send emails');
  }
});

/**
 * Resend API: POST /emails
 * Compatible with Resend SDK format
 */
app.post('/emails', async (req, res) => {
  try {
    const { from, to, subject, html, text, react } = req.body;

    // Force use of configured SMTP_FROM if 'from' is invalid
    let fromAddress = process.env.SMTP_FROM;
    if (from && !from.includes('undefined') && !from.includes('@undefined')) {
      fromAddress = from;
    }

    console.log('📧 Received email request:', {
      from: fromAddress,
      to,
      subject
    });

    // Send email via SMTP
    const info = await transporter.sendMail({
      from: fromAddress,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text: text || '',
      html: html || text || ''
    });

    console.log('✅ Email sent successfully:', info.messageId);

    // Return Resend-compatible response
    res.json({
      id: info.messageId,
      from: from || process.env.SMTP_FROM,
      to,
      created_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to send email:', error);
    res.status(500).json({
      statusCode: 500,
      message: error.message,
      name: 'api_error'
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'resend-smtp-bridge',
    smtp_host: process.env.SMTP_HOST
  });
});

/**
 * Root endpoint - API info
 */
app.get('/', (req, res) => {
  res.json({
    service: 'Resend API to SMTP Bridge',
    version: '1.0.0',
    endpoints: {
      'POST /emails': 'Send email (Resend API compatible)',
      'GET /health': 'Health check'
    }
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║        Resend to SMTP Bridge - Running!                     ║
╚══════════════════════════════════════════════════════════════╝

📧 SMTP Configuration:
   Host: ${process.env.SMTP_HOST}
   Port: ${process.env.SMTP_PORT}
   User: ${process.env.SMTP_USER}
   From: ${process.env.SMTP_FROM}

🌐 Server listening on port ${PORT}
🔗 POST /emails - Send email (Resend API compatible)
🏥 GET /health - Health check

Ready to bridge Resend API calls to SMTP! 🚀
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, closing server...');
  transporter.close();
  process.exit(0);
});

