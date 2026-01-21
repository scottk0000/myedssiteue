/**
 * Adobe I/O Runtime Action for AEM Assets to MLE Synchronization
 * This action processes AEM asset events and synchronizes metadata with Media Logic Engine (MLE)
 */

const fetch = require('node-fetch');

// Main action function
async function main(params) {
    const logger = createLogger(params.LOG_LEVEL || 'info');
    
    try {
        logger.info('Processing AEM asset event', { eventType: params.type });
        
        // Validate required parameters
        const validation = validateParams(params);
        if (!validation.valid) {
            return createErrorResponse(400, validation.error);
        }

        // Extract event data
        const eventData = extractEventData(params);
        
        // Check if asset is approved
        if (!isAssetApproved(eventData.metadata)) {
            logger.info('Asset not approved, skipping sync', { assetPath: eventData.assetPath });
            return createSuccessResponse('skipped', 'Asset not approved for publication');
        }

        // Process synchronization
        const syncResults = await processSynchronization(eventData, params, logger);
        
        return createSuccessResponse('completed', 'Metadata synchronized successfully', syncResults);
        
    } catch (error) {
        logger.error('Action execution failed', error);
        return createErrorResponse(500, error.message);
    }
}

// Logger utility
function createLogger(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const currentLevel = levels[level] || 1;
    
    return {
        debug: (msg, data) => currentLevel <= 0 && console.log(`[DEBUG] ${msg}`, data || ''),
        info: (msg, data) => currentLevel <= 1 && console.log(`[INFO] ${msg}`, data || ''),
        warn: (msg, data) => currentLevel <= 2 && console.warn(`[WARN] ${msg}`, data || ''),
        error: (msg, error) => currentLevel <= 3 && console.error(`[ERROR] ${msg}`, error || '')
    };
}

// Parameter validation
function validateParams(params) {
    const required = ['MLE_API_URL', 'OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET', 'OAUTH_TOKEN_URL'];
    
    for (const param of required) {
        if (!params[param]) {
            return { valid: false, error: `Missing required parameter: ${param}` };
        }
    }
    
    if (!params.data || !params.data.payload) {
        return { valid: false, error: 'Missing event payload data' };
    }
    
    return { valid: true };
}

// Extract event data from parameters
function extractEventData(params) {
    const payload = params.data.payload;
    
    return {
        assetPath: payload.path || payload.assetPath,
        metadata: payload.metadata || payload.properties || {},
        eventType: params.type,
        timestamp: params.data.timestamp || new Date().toISOString()
    };
}

// Check if asset is approved for publication
function isAssetApproved(metadata) {
    const approvalFields = [
        'dam:status',
        'dam:approvalStatus', 
        'cq:workflowStatus',
        'jcr:content/metadata/dam:status'
    ];
    
    return approvalFields.some(field => {
        const value = metadata[field];
        return value && (value.toLowerCase() === 'approved' || value.toLowerCase() === 'published');
    });
}

// OAuth token management
async function getAccessToken(params) {
    try {
        const response = await fetch(params.OAUTH_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: params.OAUTH_CLIENT_ID,
                client_secret: params.OAUTH_CLIENT_SECRET,
                scope: 'api:write'
            })
        });

        if (!response.ok) {
            throw new Error(`OAuth request failed: ${response.statusText}`);
        }

        const tokenData = await response.json();
        return tokenData.access_token;
    } catch (error) {
        throw new Error(`Failed to obtain access token: ${error.message}`);
    }
}

// Metadata transformation for MLE
function transformForMLE(metadata, assetPath, eventType) {
    const mimeType = metadata['dc:format'] || getMimeTypeFromPath(assetPath);
    
    return {
        // Core asset identification
        assetId: metadata['jcr:uuid'] || extractAssetIdFromPath(assetPath),
        assetPath: assetPath,
        assetUrl: constructAssetUrl(assetPath),
        
        // Media properties
        mediaType: getMediaType(mimeType),
        mimeType: mimeType,
        fileSize: metadata['dam:size'],
        fileName: extractFileNameFromPath(assetPath),
        
        // Dimensions and technical metadata
        dimensions: {
            width: metadata['tiff:ImageWidth'] || metadata['exif:PixelXDimension'],
            height: metadata['tiff:ImageLength'] || metadata['exif:PixelYDimension']
        },
        
        // Content metadata
        title: metadata['dc:title'] || metadata['jcr:title'],
        description: metadata['dc:description'],
        altText: metadata['dam:altText'] || metadata['dc:title'],
        
        // Classification and tagging
        tags: extractTags(metadata),
        categories: extractCategories(metadata),
        keywords: extractKeywords(metadata),
        
        // Business metadata
        brand: metadata['dam:brand'],
        campaign: metadata['dam:campaign'],
        productType: metadata['dam:productType'],
        usage: metadata['dam:usage'] || 'web',
        
        // Status and workflow
        approvalStatus: getApprovalStatus(metadata),
        publishStatus: 'published',
        workflowStatus: metadata['cq:workflowStatus'],
        
        // Timestamps
        createdDate: metadata['jcr:created'] || metadata['dam:created'],
        modifiedDate: metadata['jcr:lastModified'] || metadata['dam:lastModified'],
        publishedDate: new Date().toISOString(),
        
        // Technical metadata
        colorSpace: metadata['tiff:ColorSpace'],
        resolution: metadata['tiff:XResolution'],
        orientation: metadata['tiff:Orientation'],
        
        // Rights and licensing
        copyright: metadata['dc:rights'],
        license: metadata['xmpRights:UsageTerms'],
        creator: metadata['dc:creator'],
        
        // Event context
        eventType: eventType,
        sourceSystem: 'AEM'
    };
}

// Utility functions
function extractTags(metadata) {
    const tags = [];
    
    if (metadata['cq:tags']) {
        tags.push(...(Array.isArray(metadata['cq:tags']) ? metadata['cq:tags'] : [metadata['cq:tags']]));
    }
    if (metadata['dam:tags']) {
        tags.push(...(Array.isArray(metadata['dam:tags']) ? metadata['dam:tags'] : [metadata['dam:tags']]));
    }
    
    return [...new Set(tags)];
}

function extractCategories(metadata) {
    const categories = [];
    
    if (metadata['dc:subject']) {
        categories.push(...(Array.isArray(metadata['dc:subject']) ? metadata['dc:subject'] : [metadata['dc:subject']]));
    }
    if (metadata['dam:category']) {
        categories.push(...(Array.isArray(metadata['dam:category']) ? metadata['dam:category'] : [metadata['dam:category']]));
    }
    
    return [...new Set(categories)];
}

function extractKeywords(metadata) {
    const keywords = [];
    
    if (metadata['dc:keywords']) {
        keywords.push(...(Array.isArray(metadata['dc:keywords']) ? metadata['dc:keywords'] : [metadata['dc:keywords']]));
    }
    
    return [...new Set(keywords)];
}

function getMediaType(mimeType) {
    if (!mimeType) return 'unknown';
    
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf')) return 'document';
    if (mimeType.includes('text/')) return 'text';
    
    return 'other';
}

function getMimeTypeFromPath(assetPath) {
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

function getApprovalStatus(metadata) {
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

function extractAssetIdFromPath(assetPath) {
    return assetPath.split('/').pop().replace(/\.[^/.]+$/, '');
}

function extractFileNameFromPath(assetPath) {
    return assetPath.split('/').pop();
}

function constructAssetUrl(assetPath) {
    return `https://your-aem-instance.com${assetPath}`;
}

// Send data to MLE system
async function sendToMLE(data, params, logger) {
    try {
        const token = await getAccessToken(params);
        const apiVersion = params.MLE_API_VERSION || 'v1';
        
        const response = await fetch(`${params.MLE_API_URL}/${apiVersion}/assets`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-API-Version': apiVersion,
                'X-Source-System': 'AEM'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`MLE API request failed: ${response.statusText}`);
        }

        const result = await response.json();
        logger.info('Successfully sent metadata to MLE', { 
            assetId: data.assetId,
            mediaType: data.mediaType
        });
        return {
            success: true,
            mleAssetId: result.id || result.assetId,
            status: result.status,
            message: result.message,
            responseData: result
        };
    } catch (error) {
        logger.error('Failed to send metadata to MLE', error);
        return {
            success: false,
            error: error.message,
            retryable: isRetryableError(error)
        };
    }
}

// Update data in MLE system
async function updateMLE(assetId, data, params, logger) {
    try {
        const token = await getAccessToken(params);
        const apiVersion = params.MLE_API_VERSION || 'v1';
        
        const response = await fetch(`${params.MLE_API_URL}/${apiVersion}/assets/${assetId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-API-Version': apiVersion,
                'X-Source-System': 'AEM'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`MLE API update failed: ${response.statusText}`);
        }

        const result = await response.json();
        logger.info('Successfully updated metadata in MLE', { 
            assetId: assetId,
            mediaType: data.mediaType
        });
        return {
            success: true,
            mleAssetId: result.id || assetId,
            status: result.status,
            message: result.message,
            responseData: result
        };
    } catch (error) {
        logger.error('Failed to update metadata in MLE', error);
        return {
            success: false,
            error: error.message,
            retryable: isRetryableError(error)
        };
    }
}

// Delete asset from MLE system
async function deleteFromMLE(assetId, params, logger) {
    try {
        const token = await getAccessToken(params);
        const apiVersion = params.MLE_API_VERSION || 'v1';
        
        const response = await fetch(`${params.MLE_API_URL}/${apiVersion}/assets/${assetId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-API-Version': apiVersion,
                'X-Source-System': 'AEM'
            }
        });

        if (!response.ok) {
            throw new Error(`MLE API delete failed: ${response.statusText}`);
        }

        logger.info('Successfully deleted asset from MLE', { assetId: assetId });
        return {
            success: true,
            message: 'Asset deleted successfully'
        };
    } catch (error) {
        logger.error('Failed to delete asset from MLE', error);
        return {
            success: false,
            error: error.message
        };
    }
}

function isRetryableError(error) {
    if (!error.response) return true; // Network errors are retryable
    
    const status = error.response?.status;
    return status >= 500 || status === 429; // Server errors and rate limits are retryable
}

// Process synchronization with MLE system
async function processSynchronization(eventData, params, logger) {
    const result = {
        mle: null,
        status: 'processing',
        errors: [],
        assetId: eventData.metadata['jcr:uuid'] || extractAssetIdFromPath(eventData.assetPath)
    };

    try {
        // Transform metadata for MLE
        const mleData = transformForMLE(eventData.metadata, eventData.assetPath, eventData.eventType);
        
        // Determine operation based on event type
        let mleResult;
        if (eventData.eventType.includes('created') || eventData.eventType.includes('published')) {
            mleResult = await sendToMLE(mleData, params, logger);
        } else if (eventData.eventType.includes('updated') || eventData.eventType.includes('modified')) {
            mleResult = await updateMLE(mleData.assetId, mleData, params, logger);
        } else if (eventData.eventType.includes('deleted') || eventData.eventType.includes('removed')) {
            mleResult = await deleteFromMLE(mleData.assetId, params, logger);
        } else {
            // Default to create/update
            mleResult = await sendToMLE(mleData, params, logger);
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

    return result;
}

// Response helpers
function createSuccessResponse(status, message, data = null) {
    return {
        statusCode: 200,
        body: {
            status,
            message,
            timestamp: new Date().toISOString(),
            data
        }
    };
}

function createErrorResponse(statusCode, message) {
    return {
        statusCode,
        body: {
            error: message,
            timestamp: new Date().toISOString()
        }
    };
}

exports.main = main;
