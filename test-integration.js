/**
 * Integration Test Script for AEM-MLE Synchronization
 * This script tests the complete integration flow with Media Logic Engine
 */

const axios = require('axios');
const crypto = require('crypto');

// Test configuration
const TEST_CONFIG = {
    serviceUrl: process.env.SERVICE_URL || 'http://localhost:3000',
    webhookSecret: process.env.AEM_WEBHOOK_SECRET || 'test-secret',
    testTimeout: 30000
};

// Test data
const TEST_ASSET_EVENT = {
    event_type: 'com.adobe.aem.assets.updated',
    data: {
        timestamp: new Date().toISOString(),
        payload: {
            path: '/content/dam/products/test-product-001.jpg',
            metadata: {
                'jcr:uuid': 'test-uuid-12345',
                'dam:status': 'approved',
                'dc:title': 'Test Product Camera',
                'dc:identifier': 'CAM-TEST-001',
                'dc:subject': 'Electronics/Cameras',
                'dc:description': 'High-quality test camera for integration testing',
                'dam:brand': 'TestBrand',
                'dam:productType': 'Digital Camera',
                'cq:tags': ['product:camera', 'category:electronics', 'brand:testbrand'],
                'dc:keywords': ['camera', 'digital', 'photography'],
                'tiff:ImageWidth': 1920,
                'tiff:ImageLength': 1080,
                'dc:format': 'image/jpeg',
                'dam:size': 2048576
            }
        }
    }
};

// Utility functions
function generateWebhookSignature(payload, secret) {
    return crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
}

function createTestHeaders(payload) {
    const signature = generateWebhookSignature(payload, TEST_CONFIG.webhookSecret);
    return {
        'Content-Type': 'application/json',
        'x-adobe-signature': signature,
        'User-Agent': 'AEM-Integration-Test/1.0'
    };
}

// Test functions
async function testHealthEndpoint() {
    console.log('\n🔍 Testing health endpoint...');
    
    try {
        const response = await axios.get(`${TEST_CONFIG.serviceUrl}/health`, {
            timeout: 5000
        });
        
        if (response.status === 200 && response.data.status === 'healthy') {
            console.log('✅ Health check passed');
            return true;
        } else {
            console.log('❌ Health check failed:', response.data);
            return false;
        }
    } catch (error) {
        console.log('❌ Health check error:', error.message);
        return false;
    }
}

async function testWebhookEndpoint() {
    console.log('\n🔍 Testing webhook endpoint...');
    
    try {
        const headers = createTestHeaders(TEST_ASSET_EVENT);
        const response = await axios.post(
            `${TEST_CONFIG.serviceUrl}/webhook/aem-events`,
            TEST_ASSET_EVENT,
            { 
                headers,
                timeout: TEST_CONFIG.testTimeout
            }
        );
        
        if (response.status === 200) {
            console.log('✅ Webhook endpoint responded successfully');
            console.log('📄 Response:', JSON.stringify(response.data, null, 2));
            return true;
        } else {
            console.log('❌ Webhook endpoint failed:', response.status, response.data);
            return false;
        }
    } catch (error) {
        console.log('❌ Webhook endpoint error:', error.response?.data || error.message);
        return false;
    }
}

async function testInvalidSignature() {
    console.log('\n🔍 Testing invalid signature handling...');
    
    try {
        const headers = {
            'Content-Type': 'application/json',
            'x-adobe-signature': 'invalid-signature',
            'User-Agent': 'AEM-Integration-Test/1.0'
        };
        
        const response = await axios.post(
            `${TEST_CONFIG.serviceUrl}/webhook/aem-events`,
            TEST_ASSET_EVENT,
            { 
                headers,
                timeout: 5000,
                validateStatus: () => true // Don't throw on 4xx/5xx
            }
        );
        
        if (response.status === 401) {
            console.log('✅ Invalid signature correctly rejected');
            return true;
        } else {
            console.log('❌ Invalid signature not properly handled:', response.status);
            return false;
        }
    } catch (error) {
        console.log('❌ Invalid signature test error:', error.message);
        return false;
    }
}

async function testNonAssetEvent() {
    console.log('\n🔍 Testing non-asset event handling...');
    
    const nonAssetEvent = {
        event_type: 'com.adobe.aem.page.updated',
        data: {
            timestamp: new Date().toISOString(),
            payload: {
                path: '/content/site/page',
                metadata: {}
            }
        }
    };
    
    try {
        const headers = createTestHeaders(nonAssetEvent);
        const response = await axios.post(
            `${TEST_CONFIG.serviceUrl}/webhook/aem-events`,
            nonAssetEvent,
            { 
                headers,
                timeout: 5000
            }
        );
        
        if (response.status === 200 && response.data.status === 'ignored') {
            console.log('✅ Non-asset event correctly ignored');
            return true;
        } else {
            console.log('❌ Non-asset event not properly handled:', response.data);
            return false;
        }
    } catch (error) {
        console.log('❌ Non-asset event test error:', error.message);
        return false;
    }
}

async function testUnapprovedAsset() {
    console.log('\n🔍 Testing unapproved asset handling...');
    
    const unapprovedEvent = {
        ...TEST_ASSET_EVENT,
        data: {
            ...TEST_ASSET_EVENT.data,
            payload: {
                ...TEST_ASSET_EVENT.data.payload,
                metadata: {
                    ...TEST_ASSET_EVENT.data.payload.metadata,
                    'dam:status': 'draft'
                }
            }
        }
    };
    
    try {
        const headers = createTestHeaders(unapprovedEvent);
        const response = await axios.post(
            `${TEST_CONFIG.serviceUrl}/webhook/aem-events`,
            unapprovedEvent,
            { 
                headers,
                timeout: 5000
            }
        );
        
        if (response.status === 200 && response.data.status === 'skipped') {
            console.log('✅ Unapproved asset correctly skipped');
            return true;
        } else {
            console.log('❌ Unapproved asset not properly handled:', response.data);
            return false;
        }
    } catch (error) {
        console.log('❌ Unapproved asset test error:', error.message);
        return false;
    }
}

async function testMetadataTransformation() {
    console.log('\n🔍 Testing metadata transformation...');
    
    // This test would ideally mock the external API calls
    // For now, we'll test the webhook response structure
    try {
        const headers = createTestHeaders(TEST_ASSET_EVENT);
        const response = await axios.post(
            `${TEST_CONFIG.serviceUrl}/webhook/aem-events`,
            TEST_ASSET_EVENT,
            { 
                headers,
                timeout: TEST_CONFIG.testTimeout
            }
        );
        
        if (response.status === 200 && response.data.result) {
            console.log('✅ Metadata transformation completed');
            
            // Check for expected result structure
            const result = response.data.result;
            if (result.hasOwnProperty('pcm') && result.hasOwnProperty('pim')) {
                console.log('✅ Result structure is correct');
                
                if (result.errors && result.errors.length > 0) {
                    console.log('⚠️  Some errors occurred:', result.errors);
                }
                
                return true;
            } else {
                console.log('❌ Result structure is incorrect:', result);
                return false;
            }
        } else {
            console.log('❌ Metadata transformation failed:', response.data);
            return false;
        }
    } catch (error) {
        console.log('❌ Metadata transformation test error:', error.response?.data || error.message);
        return false;
    }
}

async function testConcurrentRequests() {
    console.log('\n🔍 Testing concurrent request handling...');
    
    const concurrentRequests = [];
    const numRequests = 5;
    
    for (let i = 0; i < numRequests; i++) {
        const eventCopy = {
            ...TEST_ASSET_EVENT,
            data: {
                ...TEST_ASSET_EVENT.data,
                payload: {
                    ...TEST_ASSET_EVENT.data.payload,
                    path: `/content/dam/products/test-product-${i}.jpg`,
                    metadata: {
                        ...TEST_ASSET_EVENT.data.payload.metadata,
                        'dc:identifier': `CAM-TEST-${String(i).padStart(3, '0')}`
                    }
                }
            }
        };
        
        const headers = createTestHeaders(eventCopy);
        concurrentRequests.push(
            axios.post(
                `${TEST_CONFIG.serviceUrl}/webhook/aem-events`,
                eventCopy,
                { 
                    headers,
                    timeout: TEST_CONFIG.testTimeout
                }
            )
        );
    }
    
    try {
        const responses = await Promise.allSettled(concurrentRequests);
        const successful = responses.filter(r => r.status === 'fulfilled' && r.value.status === 200);
        
        console.log(`✅ ${successful.length}/${numRequests} concurrent requests succeeded`);
        
        if (successful.length === numRequests) {
            return true;
        } else {
            const failed = responses.filter(r => r.status === 'rejected' || r.value.status !== 200);
            console.log('❌ Some concurrent requests failed:', failed.length);
            return false;
        }
    } catch (error) {
        console.log('❌ Concurrent request test error:', error.message);
        return false;
    }
}

// Main test runner
async function runAllTests() {
    console.log('🚀 Starting AEM-MLE Integration Tests');
    console.log('📍 Service URL:', TEST_CONFIG.serviceUrl);
    console.log('⏱️  Test timeout:', TEST_CONFIG.testTimeout, 'ms');
    
    const tests = [
        { name: 'Health Endpoint', fn: testHealthEndpoint },
        { name: 'Webhook Endpoint', fn: testWebhookEndpoint },
        { name: 'Invalid Signature', fn: testInvalidSignature },
        { name: 'Non-Asset Event', fn: testNonAssetEvent },
        { name: 'Unapproved Asset', fn: testUnapprovedAsset },
        { name: 'Metadata Transformation', fn: testMetadataTransformation },
        { name: 'Concurrent Requests', fn: testConcurrentRequests }
    ];
    
    const results = [];
    
    for (const test of tests) {
        console.log(`\n📋 Running test: ${test.name}`);
        try {
            const result = await test.fn();
            results.push({ name: test.name, passed: result });
        } catch (error) {
            console.log(`❌ Test ${test.name} threw an error:`, error.message);
            results.push({ name: test.name, passed: false, error: error.message });
        }
    }
    
    // Summary
    console.log('\n📊 Test Results Summary');
    console.log('========================');
    
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    
    results.forEach(result => {
        const status = result.passed ? '✅' : '❌';
        console.log(`${status} ${result.name}`);
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
    });
    
    console.log(`\n🎯 Overall: ${passed}/${total} tests passed`);
    
    if (passed === total) {
        console.log('🎉 All tests passed! Integration is working correctly.');
        process.exit(0);
    } else {
        console.log('⚠️  Some tests failed. Please check the configuration and try again.');
        process.exit(1);
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    runAllTests().catch(error => {
        console.error('💥 Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = {
    runAllTests,
    testHealthEndpoint,
    testWebhookEndpoint,
    TEST_CONFIG
};
