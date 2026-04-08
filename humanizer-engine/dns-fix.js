// Workaround: local DNS server (127.0.0.1) is refusing connections.
// This preload script forces Node to use Google/Cloudflare public DNS.
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
