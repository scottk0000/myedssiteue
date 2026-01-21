const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Configuration
const CONFIG = {
    port: process.env.PORT || 3000,
    aemWebhookSecret: process.env.AEM_WEBHOOK_SECRET,
    mleApiUrl: process.env.MLE_API_URL || 'https://your-mle-system.com/api',
    mleApiVersion: process.env.MLE_API_VERSION || 'v1',
    oauthClientId: process.env.OAUTH_CLIENT_ID,
    oauthClientSecret: process.env.OAUTH_CLIENT_SECRET,
    oauthTokenUrl: process.env.OAUTH_TOKEN_URL,
    logLevel: process.env.LOG_LEVEL || 'info',
    aemAuthorUrl: process.env.AEM_AUTHOR_URL,
    aemPublishUrl: process.env.AEM_PUBLISH_URL
};

// Logging utility
const logger = {
    info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
    error: (msg, error) => console.error(`[ERROR] ${msg}`, error || ''),
    debug: (msg, data) => CONFIG.logLevel === 'debug' && console.log(`[DEBUG] ${msg}`, data || '')
};

// Webhook signature verification
function verifyWebhookSignature(payload, signature, secret) {
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
    
    return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
    );
}

// OAuth 2.0 Token Management
class TokenManager {
    constructor() {
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    async getAccessToken() {
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        try {
            const response = await axios.post(CONFIG.oauthTokenUrl, {
                grant_type: 'client_credentials',
                client_id: CONFIG.oauthClientId,
                client_secret: CONFIG.oauthClientSecret,
                scope: 'api:write'
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            this.accessToken = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 minute buffer
            
            logger.info('OAuth token refreshed successfully');
            return this.accessToken;
        } catch (error) {
            logger.error('Failed to obtain OAuth token', error.response?.data || error.message);
            throw new Error('Authentication failed');
        }
    }
}

const tokenManager = new TokenManager();

// Asset metadata transformer for MLE
class MetadataTransformer {
    static transformForMLE(aemMetadata, assetPath, eventType) {
        const assetUrl = this.constructAssetUrl(assetPath);
        const mimeType = aemMetadata['dc:format'] || this.getMimeTypeFromPath(assetPath);
        
        return {
            // Core asset identification
            assetId: aemMetadata['jcr:uuid'] || this.extractAssetIdFromPath(assetPath),
            assetPath: assetPath,
            assetUrl: assetUrl,
            publicUrl: this.constructPublicUrl(assetPath),
            
            // Media properties
            mediaType: this.getMediaType(mimeType),
            mimeType: mimeType,
            fileSize: aemMetadata['dam:size'],
            fileName: this.extractFileNameFromPath(assetPath),
            
            // Dimensions and technical metadata
            dimensions: {
                width: aemMetadata['tiff:ImageWidth'] || aemMetadata['exif:PixelXDimension'],
                height: aemMetadata['tiff:ImageLength'] || aemMetadata['exif:PixelYDimension']
            },
            
            // Content metadata
            title: aemMetadata['dc:title'] || aemMetadata['jcr:title'],
            description: aemMetadata['dc:description'],
            altText: aemMetadata['dam:altText'] || aemMetadata['dc:title'],
            
            // Classification and tagging
            tags: this.extractTags(aemMetadata),
            categories: this.extractCategories(aemMetadata),
            keywords: this.extractKeywords(aemMetadata),
            
            // Business metadata
            brand: aemMetadata['dam:brand'],
            campaign: aemMetadata['dam:campaign'],
            productType: aemMetadata['dam:productType'],
            usage: aemMetadata['dam:usage'] || 'web',
            
            // Status and workflow
            approvalStatus: this.getApprovalStatus(aemMetadata),
            publishStatus: 'published',
            workflowStatus: aemMetadata['cq:workflowStatus'],
            
            // Timestamps
            createdDate: aemMetadata['jcr:created'] || aemMetadata['dam:created'],
            modifiedDate: aemMetadata['jcr:lastModified'] || aemMetadata['dam:lastModified'],
            publishedDate: new Date().toISOString(),
            
            // Technical metadata
            colorSpace: aemMetadata['tiff:ColorSpace'],
            resolution: aemMetadata['tiff:XResolution'],
            orientation: aemMetadata['tiff:Orientation'],
            
            // Rights and licensing
            copyright: aemMetadata['dc:rights'],
            license: aemMetadata['xmpRights:UsageTerms'],
            creator: aemMetadata['dc:creator'],
            
            // Event context
            eventType: eventType,
            sourceSystem: 'AEM',
            apiVersion: CONFIG.mleApiVersion,
            
            // Additional metadata
            customMetadata: this.extractCustomMetadata(aemMetadata)
        };
    }

    static extractTags(metadata) {
        const tags = [];
        
        // Extract from various tag fields
        if (metadata['cq:tags']) {
            const cqTags = Array.isArray(metadata['cq:tags']) ? metadata['cq:tags'] : [metadata['cq:tags']];
            tags.push(...cqTags);
        }
        if (metadata['dam:tags']) {
            const damTags = Array.isArray(metadata['dam:tags']) ? metadata['dam:tags'] : [metadata['dam:tags']];
            tags.push(...damTags);
        }
        
        return [...new Set(tags)]; // Remove duplicates
    }

    static extractCategories(metadata) {
        const categories = [];
        
        if (metadata['dc:subject']) {
            const subjects = Array.isArray(metadata['dc:subject']) ? metadata['dc:subject'] : [metadata['dc:subject']];
            categories.push(...subjects);
        }
        if (metadata['dam:category']) {
            const damCategories = Array.isArray(metadata['dam:category']) ? metadata['dam:category'] : [metadata['dam:category']];
            categories.push(...damCategories);
        }
        
        return [...new Set(categories)];
    }

    static extractKeywords(metadata) {
        const keywords = [];
        
        if (metadata['dc:keywords']) {
            const dcKeywords = Array.isArray(metadata['dc:keywords']) ? metadata['dc:keywords'] : [metadata['dc:keywords']];
            keywords.push(...dcKeywords);
        }
        
        return [...new Set(keywords)];
    }

    static getMediaType(mimeType) {
        if (!mimeType) return 'unknown';
        
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (mimeType.includes('pdf')) return 'document';
        if (mimeType.includes('text/')) return 'text';
        
        return 'other';
    }

    static getMimeTypeFromPath(assetPath) {
        const extension = assetPath.split('.').pop().toLowerCase();
        const mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'svg': 'image/svg+xml',
            'mp4': 'video/mp4',
            'mov': 'video/quicktime',
            'pdf': 'application/pdf',
            'txt': 'text/plain'
        };
        return mimeTypes[extension] || 'application/octet-stream';
    }

    static getApprovalStatus(metadata) {
        const approvalFields = [
            'dam:status',
            'dam:approvalStatus',
            'cq:workflowStatus'
        ];

        for (const field of approvalFields) {
            const value = metadata[field];
            if (value && (value.toLowerCase() === 'approved' || value.toLowerCase() === 'published')) {
                return 'approved';
            }
        }
        return 'pending';
    }

    static extractCustomMetadata(metadata) {
        const customFields = {};
        const standardFields = [
            'jcr:uuid', 'jcr:created', 'jcr:lastModified', 'jcr:title',
            'dc:title', 'dc:description', 'dc:format', 'dc:rights', 'dc:creator', 'dc:subject', 'dc:keywords',
            'dam:size', 'dam:status', 'dam:brand', 'dam:campaign', 'dam:productType', 'dam:usage', 'dam:altText',
            'tiff:ImageWidth', 'tiff:ImageLength', 'tiff:ColorSpace', 'tiff:XResolution', 'tiff:Orientation',
            'exif:PixelXDimension', 'exif:PixelYDimension',
            'cq:tags', 'cq:workflowStatus',
            'xmpRights:UsageTerms'
        ];

        Object.keys(metadata).forEach(key => {
            if (!standardFields.includes(key) && !key.startsWith('jcr:') && !key.startsWith('rep:')) {
                customFields[key] = metadata[key];
            }
        });

        return customFields;
    }

    static extractAssetIdFromPath(assetPath) {
        return assetPath.split('/').pop().replace(/\.[^/.]+$/, '');
    }

    static extractFileNameFromPath(assetPath) {
        return assetPath.split('/').pop();
    }

    static constructAssetUrl(assetPath) {
        return `${CONFIG.aemAuthorUrl}${assetPath}`;
    }

    static constructPublicUrl(assetPath) {
        return `${CONFIG.aemPublishUrl}${assetPath}`;
    }
}

// MLE API Client
class MLEClient {
    static async sendAssetMetadata(transformedData) {
        try {
            const token = await tokenManager.getAccessToken();
            
            const endpoint = `${CONFIG.mleApiUrl}/${CONFIG.mleApiVersion}/assets`;
            
            const response = await axios.post(endpoint, transformedData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-API-Version': CONFIG.mleApiVersion,
                    'X-Source-System': 'AEM'
                },
                timeout: 30000
            });

            logger.info('Successfully sent asset metadata to MLE', { 
                assetId: transformedData.assetId,
                mediaType: transformedData.mediaType,
                status: response.status
            });
            
            return {
                success: true,
                mleAssetId: response.data.id || response.data.assetId,
                status: response.data.status,
                message: response.data.message,
                responseData: response.data
            };
        } catch (error) {
            const errorDetails = {
                assetId: transformedData.assetId,
                error: error.response?.data || error.message,
                status: error.response?.status,
                endpoint: `${CONFIG.mleApiUrl}/${CONFIG.mleApiVersion}/assets`
            };
            
            logger.error('Failed to send asset metadata to MLE', errorDetails);
            
            return {
                success: false,
                error: errorDetails,
                retryable: this.isRetryableError(error)
            };
        }
    }

    static async updateAssetMetadata(assetId, transformedData) {
        try {
            const token = await tokenManager.getAccessToken();
            
            const endpoint = `${CONFIG.mleApiUrl}/${CONFIG.mleApiVersion}/assets/${assetId}`;
            
            const response = await axios.put(endpoint, transformedData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-API-Version': CONFIG.mleApiVersion,
                    'X-Source-System': 'AEM'
                },
                timeout: 30000
            });

            logger.info('Successfully updated asset metadata in MLE', { 
                assetId: assetId,
                mediaType: transformedData.mediaType,
                status: response.status
            });
            
            return {
                success: true,
                mleAssetId: response.data.id || assetId,
                status: response.data.status,
                message: response.data.message,
                responseData: response.data
            };
        } catch (error) {
            const errorDetails = {
                assetId: assetId,
                error: error.response?.data || error.message,
                status: error.response?.status,
                endpoint: `${CONFIG.mleApiUrl}/${CONFIG.mleApiVersion}/assets/${assetId}`
            };
            
            logger.error('Failed to update asset metadata in MLE', errorDetails);
            
            return {
                success: false,
                error: errorDetails,
                retryable: this.isRetryableError(error)
            };
        }
    }

    static async deleteAsset(assetId) {
        try {
            const token = await tokenManager.getAccessToken();
            
            const endpoint = `${CONFIG.mleApiUrl}/${CONFIG.mleApiVersion}/assets/${assetId}`;
            
            const response = await axios.delete(endpoint, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-API-Version': CONFIG.mleApiVersion,
                    'X-Source-System': 'AEM'
                },
                timeout: 30000
            });

            logger.info('Successfully deleted asset from MLE', { 
                assetId: assetId,
                status: response.status
            });
            
            return {
                success: true,
                message: 'Asset deleted successfully'
            };
        } catch (error) {
            const errorDetails = {
                assetId: assetId,
                error: error.response?.data || error.message,
                status: error.response?.status
            };
            
            logger.error('Failed to delete asset from MLE', errorDetails);
            
            return {
                success: false,
                error: errorDetails
            };
        }
    }

    static isRetryableError(error) {
        if (!error.response) return true; // Network errors are retryable
        
        const status = error.response.status;
        return status >= 500 || status === 429; // Server errors and rate limits are retryable
    }
}

// Event processor for MLE integration
class EventProcessor {
    static async processAssetEvent(eventData) {
        const { assetPath, metadata, eventType } = eventData;
        
        logger.info('Processing asset event for MLE', { assetPath, eventType });
        logger.debug('Asset metadata', metadata);

        // Check if asset is approved for publication
        // In AEM Assets as a Cloud Service, approval is indicated by metadata status
        if (!this.isAssetApproved(metadata)) {
            logger.info('Asset not approved, skipping MLE synchronization', { assetPath, eventType });
            return { status: 'skipped', reason: 'Asset not approved for publication' };
        }
        
        logger.info('Asset approved, proceeding with MLE synchronization', { assetPath, eventType });

        const result = {
            mle: null,
            status: 'processing',
            errors: [],
            assetId: metadata['jcr:uuid'] || MetadataTransformer.extractAssetIdFromPath(assetPath)
        };

        try {
            // Transform metadata for MLE
            const mleData = MetadataTransformer.transformForMLE(metadata, assetPath, eventType);
            
            // Determine operation based on event type
            let mleResult;
            if (eventType.includes('created') || eventType.includes('published')) {
                mleResult = await MLEClient.sendAssetMetadata(mleData);
            } else if (eventType.includes('updated') || eventType.includes('modified')) {
                mleResult = await MLEClient.updateAssetMetadata(mleData.assetId, mleData);
            } else if (eventType.includes('deleted') || eventType.includes('removed')) {
                mleResult = await MLEClient.deleteAsset(mleData.assetId);
            } else {
                // Default to create/update
                mleResult = await MLEClient.sendAssetMetadata(mleData);
            }

            result.mle = mleResult;
            result.status = mleResult.success ? 'completed' : 'failed';
            
            if (!mleResult.success) {
                result.errors.push({
                    system: 'MLE',
                    error: mleResult.error,
                    retryable: mleResult.retryable
                });
            }

        } catch (error) {
            logger.error('Unexpected error processing asset event', error);
            result.errors.push({
                system: 'MLE',
                error: error.message,
                retryable: true
            });
            result.status = 'error';
        }

        // Log final result
        if (result.status === 'completed') {
            logger.info('Asset successfully synchronized to MLE', {
                assetId: result.assetId,
                mleAssetId: result.mle?.mleAssetId
            });
        } else {
            logger.error('Asset synchronization failed', {
                assetId: result.assetId,
                errors: result.errors
            });
        }

        return result;
    }

    static isAssetApproved(metadata) {
        // Check various approval status fields
        const approvalFields = [
            'dam:status',
            'dam:approvalStatus',
            'cq:workflowStatus',
            'jcr:content/metadata/dam:status'
        ];

        for (const field of approvalFields) {
            const value = metadata[field];
            if (value && (value.toLowerCase() === 'approved' || value.toLowerCase() === 'published')) {
                return true;
            }
        }

        return false;
    }

    static shouldProcessEvent(eventType) {
        // Define which event types should trigger MLE synchronization
        // For AEM Assets as a Cloud Service (Assets Only), focus on metadata and workflow events
        const processableEvents = [
            // Primary event - when metadata is updated (including dam:status = "approved")
            'com.adobe.aem.assets.metadata.updated', // Metadata updated (including status changes)
            
            // Workflow events - approval workflows completion
            'com.adobe.aem.workflow.completed',      // Workflow completed (approval workflows)
            
            // Asset lifecycle events
            'com.adobe.aem.assets.created',         // Asset created (may be pre-approved)
            'com.adobe.aem.assets.updated',         // Asset updated (general updates)
            
            // Cleanup events
            'com.adobe.aem.assets.deleted',         // Asset deleted
            'com.adobe.aem.assets.removed'          // Asset removed
            
            // Note: No publish/activate events in Assets-only Cloud Service
            // Assets are managed in author environment only, no separate publish tier
        ];

        return processableEvents.some(event => eventType.includes(event.split('.').pop()));
    }
}

// Webhook endpoint for AEM events
app.post('/webhook/aem-events', async (req, res) => {
    try {
        // Verify webhook signature if configured
        if (CONFIG.aemWebhookSecret) {
            const signature = req.headers['x-adobe-signature'];
            if (!signature || !verifyWebhookSignature(JSON.stringify(req.body), signature, CONFIG.aemWebhookSecret)) {
                logger.error('Invalid webhook signature');
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }

        const eventData = req.body;
        logger.info('Received AEM event', { eventType: eventData.event_type });

        // Process only asset-related events
        if (!eventData.event_type || !EventProcessor.shouldProcessEvent(eventData.event_type)) {
            logger.info('Non-processable event, ignoring', { eventType: eventData.event_type });
            return res.status(200).json({ status: 'ignored', reason: 'Event type not supported for MLE synchronization' });
        }

        // Process the event
        const result = await EventProcessor.processAssetEvent(eventData);
        
        res.status(200).json({
            status: 'processed',
            timestamp: new Date().toISOString(),
            result
        });

    } catch (error) {
        logger.error('Error processing webhook', error);
        res.status(500).json({
            error: 'Internal server error',
            timestamp: new Date().toISOString()
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error('Unhandled error', error);
    res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(CONFIG.port, () => {
    logger.info(`AEM-MLE Sync Service running on port ${CONFIG.port}`);
    logger.info('Configuration loaded', {
        mleApiUrl: CONFIG.mleApiUrl,
        mleApiVersion: CONFIG.mleApiVersion,
        aemAuthorUrl: CONFIG.aemAuthorUrl,
        aemPublishUrl: CONFIG.aemPublishUrl,
        webhookSecretConfigured: !!CONFIG.aemWebhookSecret
    });
});

module.exports = app;
