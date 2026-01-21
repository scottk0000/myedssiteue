# AEM Assets to MLE Synchronization - Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the AEM Assets to MLE (Media Logic Engine) metadata synchronization solution. The solution supports both traditional server deployment and Adobe I/O Runtime serverless deployment.

## Prerequisites

### AEM Configuration
1. **AEM as a Cloud Service** environment with Assets enabled
2. **Admin access** to configure event emission
3. **Asset metadata schema** configured with approval workflow

### External Systems
1. **MLE System** with REST API access
2. **OAuth 2.0 credentials** for API authentication
3. **API endpoints** for metadata ingestion

### Development Environment
1. **Node.js 16+** installed
2. **Adobe I/O CLI** (for serverless deployment)
3. **Docker** (for containerized deployment)

## Deployment Options

### Option 1: Traditional Server Deployment

#### Step 1: Environment Setup

1. **Clone or download** the solution files
2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp env.example .env
   # Edit .env with your specific configuration
   ```

4. **Required environment variables**:
   ```env
   PORT=3000
   AEM_WEBHOOK_SECRET=your-webhook-secret
   MLE_API_URL=https://your-mle-system.com/api
   MLE_API_VERSION=v1
   OAUTH_CLIENT_ID=your-client-id
   OAUTH_CLIENT_SECRET=your-client-secret
   OAUTH_TOKEN_URL=https://auth.example.com/oauth/token
   AEM_AUTHOR_URL=https://author-your-program-your-env.adobeaemcloud.com
   AEM_PUBLISH_URL=https://publish-your-program-your-env.adobeaemcloud.com
   ```

#### Step 2: Start the Service

**Development mode**:
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

**Docker deployment**:
```bash
# Build image
npm run docker:build

# Run container
npm run docker:run
```

#### Step 3: Configure AEM Events

1. **Access Adobe Developer Console**
2. **Create new project** or use existing
3. **Add AEM Events API**
4. **Configure webhook endpoint**: `https://your-domain.com/webhook/aem-events`
5. **Set webhook secret** (same as AEM_WEBHOOK_SECRET)
6. **Subscribe to asset events**:
   - `com.adobe.aem.assets.created`
   - `com.adobe.aem.assets.updated`
   - `com.adobe.aem.assets.published`

### Option 2: Adobe I/O Runtime Deployment

#### Step 1: Setup Adobe I/O CLI

```bash
# Install Adobe I/O CLI
npm install -g @adobe/aio-cli

# Login to Adobe I/O
aio login

# Select organization and project
aio console:select-org
aio console:select-project
```

#### Step 2: Configure Runtime Action

1. **Set environment variables** in Adobe Developer Console
2. **Deploy the action**:
   ```bash
   aio app deploy
   ```

3. **Get action URL**:
   ```bash
   aio runtime action get aem-asset-sync --url
   ```

#### Step 3: Configure AEM Events

1. **Use the Runtime action URL** as webhook endpoint
2. **Configure event subscriptions** as described above

## AEM Configuration

### Step 1: Enable Asset Events

1. **Navigate to AEM Author** instance
2. **Go to Tools > Operations > Web Console**
3. **Find "Adobe CQ DAM Event Listener"**
4. **Enable event emission** for asset operations

### Step 2: Configure Asset Approval Workflow

1. **Create custom workflow** or modify existing
2. **Add workflow step** to set `dam:status` to "approved"
3. **Configure workflow** to trigger on asset publication

### Step 3: Metadata Schema Configuration

Ensure your asset metadata schema includes these fields:
- `dam:status` (for approval status)
- `dc:title` (product name)
- `dc:identifier` (SKU)
- `dc:subject` (category)
- `dam:brand` (brand name)
- `dam:productType` (product type)

## Testing the Integration

### Step 1: Health Check

**Test service availability**:
```bash
curl http://your-domain.com/health
```

**Expected response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

### Step 2: Manual Event Test

**Send test event**:
```bash
curl -X POST http://your-domain.com/webhook/aem-events \
  -H "Content-Type: application/json" \
  -H "x-adobe-signature: your-signature" \
  -d '{
    "event_type": "com.adobe.aem.assets.updated",
    "data": {
      "payload": {
        "path": "/content/dam/test-product.jpg",
        "metadata": {
          "dam:status": "approved",
          "dc:title": "Test Product",
          "dc:identifier": "TEST-SKU-001",
          "dc:subject": "Electronics",
          "dam:brand": "Test Brand"
        }
      }
    }
  }'
```

### Step 3: End-to-End Testing

1. **Upload asset** to AEM DAM
2. **Add required metadata**:
   - Product name
   - SKU
   - Category
   - Brand
3. **Set approval status** to "approved"
4. **Publish the asset**
5. **Verify synchronization** in PCM/PIM systems

## Monitoring and Troubleshooting

### Logging

**Check service logs**:
```bash
# For server deployment
tail -f logs/app.log

# For Docker deployment
docker logs aem-pcm-sync

# For Adobe I/O Runtime
aio runtime activation logs --last
```

### Common Issues

#### 1. Authentication Failures
- **Check OAuth credentials**
- **Verify token endpoint**
- **Ensure proper scopes**

#### 2. Webhook Signature Verification
- **Verify webhook secret** matches AEM configuration
- **Check signature header** format

#### 3. Metadata Transformation Errors
- **Validate asset metadata** structure
- **Check field mappings** in transformer
- **Verify required fields** are present

#### 4. External API Failures
- **Check API endpoints** availability
- **Verify authentication** tokens
- **Review API rate limits**

### Performance Monitoring

**Key metrics to monitor**:
- Event processing time
- API response times
- Error rates
- Authentication token refresh frequency

**Recommended monitoring tools**:
- Application Performance Monitoring (APM)
- Log aggregation (ELK stack)
- Custom dashboards for business metrics

## Security Considerations

### 1. Network Security
- **Use HTTPS** for all communications
- **Implement firewall rules** for webhook endpoints
- **Use VPN** for internal network access

### 2. Authentication Security
- **Rotate OAuth credentials** regularly
- **Use environment variables** for secrets
- **Implement token refresh** logic

### 3. Data Security
- **Encrypt sensitive data** in transit and at rest
- **Implement audit logging**
- **Follow data privacy regulations**

## Scaling Considerations

### Horizontal Scaling
- **Load balancer** for multiple service instances
- **Database clustering** for session storage
- **Message queues** for event processing

### Vertical Scaling
- **Increase memory** allocation
- **Optimize database** queries
- **Implement caching** strategies

## Maintenance

### Regular Tasks
1. **Monitor logs** for errors
2. **Update dependencies** regularly
3. **Review performance** metrics
4. **Test backup/recovery** procedures

### Updates and Patches
1. **Test in staging** environment first
2. **Follow semantic versioning**
3. **Document changes** in changelog
4. **Coordinate with stakeholders**

## Support and Documentation

### Additional Resources
- [AEM Events Documentation](https://developer.adobe.com/events/docs/guides/using/aem/cloud-native/)
- [Adobe I/O Runtime Documentation](https://developer.adobe.com/runtime/docs/)
- [AEM Assets HTTP API](https://developer.adobe.com/experience-cloud/experience-manager-apis/api/stable/assets/author/)

### Getting Help
- **Check logs** for error details
- **Review configuration** settings
- **Test individual components** in isolation
- **Contact system administrators** for infrastructure issues
