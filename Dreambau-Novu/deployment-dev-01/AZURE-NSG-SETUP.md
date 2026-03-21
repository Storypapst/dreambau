# Azure NSG Configuration for Novu on dev-01

## 🔥 Issue: Ports Blocked by Azure NSG

The Novu services are running correctly on the server, but **Azure Network Security Group (NSG)** is blocking external access to the ports.

### ✅ Confirmed Working
- ✅ Docker containers are running
- ✅ Ports are listening on 0.0.0.0 (all interfaces)
- ✅ Local access works (from within the server)
- ❌ External access blocked by Azure NSG

---

## 🔧 Required Azure NSG Rules

You need to add **3 inbound security rules** in Azure Portal:

### Rule 1: Novu API (Port 3001)
```
Name:                 Allow-Novu-API
Priority:             1010
Source:               Any (or your IP range)
Source port ranges:   *
Destination:          Any
Destination port:     3001
Protocol:             TCP
Action:               Allow
```

### Rule 2: Novu Dashboard (Port 4001)
```
Name:                 Allow-Novu-Dashboard
Priority:             1011
Source:               Any (or your IP range)
Source port ranges:   *
Destination:          Any
Destination port:     4001
Protocol:             TCP
Action:               Allow
```

### Rule 3: Novu WebSocket (Port 3002)
```
Name:                 Allow-Novu-WebSocket
Priority:             1012
Source:               Any (or your IP range)
Source port ranges:   *
Destination:          Any
Destination port:     3002
Protocol:             TCP
Action:               Allow
```

---

## 📋 Step-by-Step: Add NSG Rules in Azure Portal

### Method 1: Azure Portal (GUI)

1. **Go to Azure Portal:** https://portal.azure.com

2. **Navigate to Network Security Groups:**
   - Search for "Network Security Groups" in the top search bar
   - OR go to: Home → All resources → Filter by "Network Security Group"

3. **Select the NSG for dev-01:**
   - Look for the NSG associated with VM: **dev-01** (72.144.25.104)
   - Click on it

4. **Add Inbound Security Rules:**
   - In the left menu, click **"Inbound security rules"**
   - Click **"+ Add"** button at the top

5. **Add Rule for Port 4001 (Dashboard):**
   - Source: `Any` (or `IP Addresses` and enter your IP)
   - Source port ranges: `*`
   - Destination: `Any`
   - Service: `Custom`
   - Destination port ranges: `4001`
   - Protocol: `TCP`
   - Action: `Allow`
   - Priority: `1011` (or any available number 100-4096)
   - Name: `Allow-Novu-Dashboard`
   - Click **"Add"**

6. **Repeat for Port 3001 (API):**
   - Same as above but:
   - Destination port ranges: `3001`
   - Priority: `1010`
   - Name: `Allow-Novu-API`

7. **Repeat for Port 3002 (WebSocket):**
   - Same as above but:
   - Destination port ranges: `3002`
   - Priority: `1012`
   - Name: `Allow-Novu-WebSocket`

8. **Wait 1-2 minutes** for rules to propagate

9. **Test access:** http://72.144.25.104:4001

---

### Method 2: Azure CLI

If you have Azure CLI installed:

```bash
# Get the NSG name (replace with your resource group)
RESOURCE_GROUP="your-resource-group-name"
NSG_NAME="your-nsg-name"

# Add rule for Dashboard (port 4001)
az network nsg rule create \
  --resource-group $RESOURCE_GROUP \
  --nsg-name $NSG_NAME \
  --name Allow-Novu-Dashboard \
  --priority 1011 \
  --source-address-prefixes '*' \
  --source-port-ranges '*' \
  --destination-address-prefixes '*' \
  --destination-port-ranges 4001 \
  --access Allow \
  --protocol Tcp \
  --description "Allow Novu Dashboard"

# Add rule for API (port 3001)
az network nsg rule create \
  --resource-group $RESOURCE_GROUP \
  --nsg-name $NSG_NAME \
  --name Allow-Novu-API \
  --priority 1010 \
  --source-address-prefixes '*' \
  --source-port-ranges '*' \
  --destination-address-prefixes '*' \
  --destination-port-ranges 3001 \
  --access Allow \
  --protocol Tcp \
  --description "Allow Novu API"

# Add rule for WebSocket (port 3002)
az network nsg rule create \
  --resource-group $RESOURCE_GROUP \
  --nsg-name $NSG_NAME \
  --name Allow-Novu-WebSocket \
  --priority 1012 \
  --source-address-prefixes '*' \
  --source-port-ranges '*' \
  --destination-address-prefixes '*' \
  --destination-port-ranges 3002 \
  --access Allow \
  --protocol Tcp \
  --description "Allow Novu WebSocket"
```

---

### Method 3: Azure PowerShell

```powershell
# Variables
$ResourceGroup = "your-resource-group-name"
$NSGName = "your-nsg-name"

# Add rule for Dashboard (port 4001)
Add-AzNetworkSecurityRuleConfig `
  -Name "Allow-Novu-Dashboard" `
  -NetworkSecurityGroup $nsg `
  -Protocol Tcp `
  -Direction Inbound `
  -Priority 1011 `
  -SourceAddressPrefix * `
  -SourcePortRange * `
  -DestinationAddressPrefix * `
  -DestinationPortRange 4001 `
  -Access Allow

# Add rule for API (port 3001)
Add-AzNetworkSecurityRuleConfig `
  -Name "Allow-Novu-API" `
  -NetworkSecurityGroup $nsg `
  -Protocol Tcp `
  -Direction Inbound `
  -Priority 1010 `
  -SourceAddressPrefix * `
  -SourcePortRange * `
  -DestinationAddressPrefix * `
  -DestinationPortRange 3001 `
  -Access Allow

# Add rule for WebSocket (port 3002)
Add-AzNetworkSecurityRuleConfig `
  -Name "Allow-Novu-WebSocket" `
  -NetworkSecurityGroup $nsg `
  -Protocol Tcp `
  -Direction Inbound `
  -Priority 1012 `
  -SourceAddressPrefix * `
  -SourcePortRange * `
  -DestinationAddressPrefix * `
  -DestinationPortRange 3002 `
  -Access Allow

# Apply changes
Set-AzNetworkSecurityGroup -NetworkSecurityGroup $nsg
```

---

## 🔒 Security Considerations

### Option A: Allow from Anywhere (Less Secure)
```
Source: Any (0.0.0.0/0)
```
Use this for public-facing services or testing.

### Option B: Restrict to Specific IPs (More Secure)
```
Source: IP Addresses
Source IP addresses: 203.0.113.0/24, 198.51.100.50
```
Use this for internal/restricted access.

### Option C: Restrict to Your Office/VPN
```
Source: IP Addresses
Source IP addresses: your.office.ip.address/32
```
Most secure - only your IP can access.

---

## ✅ Verification Steps

After adding the NSG rules:

### 1. Wait 1-2 Minutes
Azure NSG rules take a moment to propagate.

### 2. Test from Your Browser
```
http://72.144.25.104:4001
```

### 3. Test from Command Line
```bash
# Test Dashboard
curl -I http://72.144.25.104:4001

# Test API
curl http://72.144.25.104:3001/v1/health-check

# Test WebSocket (should get upgrade response)
curl -I http://72.144.25.104:3002
```

### 4. Check NSG Rules Applied
In Azure Portal:
- Go to your NSG
- Click "Inbound security rules"
- Verify the 3 new rules are listed and enabled

---

## 🐛 Troubleshooting

### Rules Added But Still Can't Access?

1. **Check NSG is attached to the correct resource:**
   - Go to NSG → Settings → Network interfaces
   - Verify dev-01's network interface is listed

2. **Check rule priority:**
   - Lower number = higher priority
   - Make sure no DENY rule with lower priority is blocking

3. **Check rule is enabled:**
   - In the rules list, verify "Allow" action

4. **Try from different network:**
   - Some corporate networks block non-standard ports
   - Try from mobile hotspot or different network

5. **Check if there's a subnet NSG:**
   - NSGs can be applied to subnets AND network interfaces
   - Check both locations

6. **Verify VM is running:**
   ```bash
   ssh -i ~/Desktop/H/dev-01.pem azureuser@72.144.25.104 "docker compose -f ~/novu/docker-compose.yml ps"
   ```

---

## 📊 Current Status

### ✅ Working (Confirmed)
- Docker containers running
- Services healthy
- Ports listening on 0.0.0.0
- Local access working

### ❌ Not Working (Needs Fix)
- External access to ports 3001, 4001, 3002
- **Cause:** Azure NSG blocking inbound traffic

### 🔧 Solution
Add the 3 NSG inbound rules as described above.

---

## 📞 Need Help?

If you don't have access to Azure Portal:
1. Contact your Azure administrator
2. Provide them this document
3. Request the 3 NSG rules to be added

**Ports needed:**
- 3001 (Novu API)
- 4001 (Novu Dashboard)
- 3002 (Novu WebSocket)

---

## 📝 Quick Summary

**Problem:** Can't access http://72.144.25.104:4001  
**Cause:** Azure NSG blocking ports  
**Solution:** Add 3 inbound NSG rules for ports 3001, 4001, 3002  
**Time to fix:** 5 minutes in Azure Portal  

Once the NSG rules are added, Novu will be immediately accessible! 🚀



