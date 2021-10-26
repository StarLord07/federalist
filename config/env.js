module.exports = {
  cfDomainGuid: process.env.CF_DOMAIN_GUID || '123abc-456def-789ghi',
  cfProxyGuid: process.env.CF_PROXY_GUID || '123abc-456def-789ghi',
  cfSpaceGuid: process.env.CF_SPACE_GUID || '123abc-456def-789ghi',
  cfCdnSpaceName: process.env.CF_CDN_SPACE_NAME || 'sites',
  cfDomainWithCdnPlanGuid: process.env.CF_DOMAIN_WITH_CDN_PLAN_GUID || '123abc-456def-789ghi',
  cfOauthTokenUrl: process.env.CLOUD_FOUNDRY_OAUTH_TOKEN_URL || 'https://login.example.com/oauth/token',
  cfApiHost: process.env.CLOUD_FOUNDRY_API_HOST || 'https://api.example.com',
  uaaHost: process.env.UAA_HOST || 'http://uaa.example.com',
  uaaHostUrl: process.env.UAA_HOST_DOCKER_URL || process.env.UAA_HOST || 'http://uaa.example.com',
};
