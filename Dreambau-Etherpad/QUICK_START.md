# Etherpad Quick Start Guide

## 🚀 Access Information

**URL**: https://etherpad.dreambau.com

**Admin Login**:
- Username: `admin`
- Password: `2sGH6syYR+Ie9uGCmmoc3Ib9HrFNjIrH`

**Admin Panel**: https://etherpad.dreambau.com/admin

## 📝 Quick Usage

### Create a Pad

1. Go to https://etherpad.dreambau.com
2. Enter a pad name in the URL: https://etherpad.dreambau.com/p/your-pad-name
3. Start typing - changes sync in real-time!

### Share a Pad

Simply share the URL with collaborators:
```
https://etherpad.dreambau.com/p/meeting-notes
```

Everyone with the link can edit simultaneously.

## 🔑 API Access

**API Key**: (stored in secret, retrieve with):
```bash
kubectl get secret etherpad-secret -n wcr -o jsonpath='{.data.API_KEY}' | base64 -d
```

**API Endpoint**: https://etherpad.dreambau.com/api/1/

**Example API Calls**:

```bash
# Get your API key first
API_KEY=$(kubectl get secret etherpad-secret -n wcr -o jsonpath='{.data.API_KEY}' | base64 -d)

# Create a new pad
curl "https://etherpad.dreambau.com/api/1/createPad?apikey=$API_KEY&padID=test-pad&text=Hello%20World"

# Get pad text
curl "https://etherpad.dreambau.com/api/1/getText?apikey=$API_KEY&padID=test-pad"

# Get pad HTML
curl "https://etherpad.dreambau.com/api/1/getHTML?apikey=$API_KEY&padID=test-pad"

# List all pads
curl "https://etherpad.dreambau.com/api/1/listAllPads?apikey=$API_KEY"

# Delete a pad
curl "https://etherpad.dreambau.com/api/1/deletePad?apikey=$API_KEY&padID=test-pad"
```

## 🛠️ Common Commands

### View Logs
```bash
kubectl logs -n wcr -l app=etherpad -f
```

### Check Status
```bash
kubectl get pods -n wcr -l app=etherpad
```

### Restart Etherpad
```bash
kubectl rollout restart deployment/etherpad -n wcr
```

### Access Database
```bash
POSTGRES_POD=$(kubectl get pods -n wcr -l app=shared-postgres -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it -n wcr $POSTGRES_POD -- psql -U etherpad -d etherpad
```

### Backup Database
```bash
POSTGRES_POD=$(kubectl get pods -n wcr -l app=shared-postgres -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n wcr $POSTGRES_POD -- pg_dump -U etherpad etherpad | gzip > etherpad-backup-$(date +%Y%m%d).sql.gz
```

## 🎨 Features

- **Real-time collaboration**: Multiple users editing simultaneously
- **Rich text editing**: Bold, italic, underline, lists, colors
- **Import/Export**: HTML, PDF, DOC, ODT, TXT
- **Time slider**: View document history
- **Built-in chat**: Communicate with collaborators
- **Revisions**: Save and restore specific versions

## 📱 Use Cases

1. **Meeting Notes**: Collaborative note-taking during meetings
2. **Documentation**: Draft and edit documents together
3. **Brainstorming**: Collect ideas from team members
4. **Code Reviews**: Share and discuss code snippets
5. **Project Planning**: Outline project requirements
6. **Education**: Collaborative learning and assignments

## 🔒 Security Notes

- Admin panel is protected with username/password
- By default, anyone can create and edit pads (anonymous access)
- To require authentication, edit settings in `config/etherpad-deployment.yaml`
- All traffic is encrypted with SSL/TLS
- API key required for programmatic access

## 📚 More Information

See the full README.md for:
- Detailed configuration options
- Plugin installation
- Advanced customization
- Troubleshooting guide
- Backup and restore procedures

## 🆘 Troubleshooting

### Can't access Etherpad?

1. Check DNS:
   ```bash
   nslookup etherpad.dreambau.com
   ```

2. Check pod status:
   ```bash
   kubectl get pods -n wcr -l app=etherpad
   ```

3. Check logs:
   ```bash
   kubectl logs -n wcr -l app=etherpad --tail=50
   ```

### Database connection issues?

```bash
# Test database connection
POSTGRES_POD=$(kubectl get pods -n wcr -l app=shared-postgres -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n wcr $POSTGRES_POD -- psql -U etherpad -d etherpad -c "SELECT 1;"
```

## 📞 Support

For issues:
1. Check logs: `kubectl logs -n wcr -l app=etherpad`
2. Review README.md for detailed troubleshooting
3. Check Etherpad documentation: https://etherpad.org/doc/latest/

---

**Deployment Date**: November 19, 2025
**Version**: Etherpad 2.5.3
**Status**: ✅ Running


