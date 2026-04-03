const dns = require('dns');
const { Resolver } = dns;
const resolver = new Resolver();
resolver.setServers(['8.8.8.8', '8.8.4.4']);

// Override the default resolver
const origResolve = dns.resolve;
const origResolve4 = dns.resolve4;
const origResolveAny = dns.resolveAny;

dns.resolve = function(hostname, ...args) {
  return resolver.resolve(hostname, ...args);
};
dns.resolve4 = function(hostname, ...args) {
  return resolver.resolve4(hostname, ...args);
};
dns.resolveAny = function(hostname, ...args) {
  return resolver.resolveAny(hostname, ...args);
};
