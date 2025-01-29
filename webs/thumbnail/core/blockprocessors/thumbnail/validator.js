const BaseBlockValidator = require('../../../../../core/blockprocessors/base/basevalidator');
const Jimp = require('jimp').Jimp;

class ThumbnailBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        // Set validation checks explicitly
        this.setValidationChecks(['signature']); // TODO: Add fromAccount
        this.setFinalValidationChecks(['timestamp', 'hash']);
        
        // Add thumbnail-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['thumbnail'] },
            data: { type: 'string' }, // Base64 encoded image data
            width: { type: 'number', maximum: 512 },
            height: { type: 'number', maximum: 512 },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
            timestamp: { type: 'number' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'data', 'width', 'height', 'delegator', 'fromAccount', 'toAccount',
            'timestamp', 'signature'
        ]);

        this.setAdditionalProperties(false);

        this.addBasicCheck(this.basicCheck.bind(this));
    }

    async basicCheck(block) {
        try {
            // Convert base64 to buffer
            const imageBuffer = Buffer.from(block.data, 'base64');

            // Check file size (max 100KB)
            if (imageBuffer.length > 100 * 1024) {
                return { state: 'THUMBNAIL_TOO_LARGE' };
            }

            // Validate image using Jimp
            const image = await Jimp.read(imageBuffer);
            console.log(`------->image.mime: ${image.mime}`);
            // Get image information
            const metadata = {
                width: image.width,
                height: image.height,
                format: image.mime.split('/')[1] // Gets format from MIME type
            };

            // Check if it's a valid image format
            const validFormats = ['jpeg', 'png', 'gif'];
            if (!validFormats.includes(metadata.format)) {
                return { state: 'INVALID_IMAGE_FORMAT' };
            }

            // Check dimensions
            if (metadata.width > 512 || metadata.height > 512) {
                return { state: 'IMAGE_TOO_LARGE' };
            }

            // Check minimum dimensions
            if (metadata.width < 64 || metadata.height < 64) {
                return { state: 'IMAGE_TOO_SMALL' };
            }

            // Check if dimensions match what's declared in block
            if (metadata.width !== block.width || metadata.height !== block.height) {
                return { state: 'DIMENSION_MISMATCH' };
            }

            return { state: 'VALID' };
        } catch (error) {
            console.error('Image validation error:', error);
            return { state: 'INVALID_IMAGE' };
        }
    }
}

module.exports = ThumbnailBlockValidator;
