const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator');
const Jimp = require('jimp').Jimp;

class ThumbnailInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['thumbnail'] },
            data: { type: 'string' }, // Base64 encoded image data
            width: { type: 'number', maximum: 512 },
            height: { type: 'number', maximum: 512 }
        }, [
            'type',
            'data',
            'width',
            'height'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;

        try {
            // Convert base64 to buffer
            const imageBuffer = Buffer.from(instruction.data, 'base64');

            // Check file size (max 100KB)
            if (imageBuffer.length > 100 * 1024) {
                return { state: 'THUMBNAIL_TOO_LARGE' };
            }

            // Validate image using Jimp
            const image = await Jimp.read(imageBuffer);

            // Check if it's a valid image format
            console.log(image);
            const format = image.mime.split('/')[1];
            const validFormats = ['jpeg', 'png', 'gif'];
            if (!validFormats.includes(format)) {
                return { state: 'INVALID_IMAGE_FORMAT' };
            }

            // Check dimensions
            if (image.width > 512 || image.height > 512) {
                return { state: 'IMAGE_TOO_LARGE' };
            }
            if (image.width < 64 || image.height < 64) {
                return { state: 'IMAGE_TOO_SMALL' };
            }
            if (image.width !== instruction.width || image.height !== instruction.height) {
                return { state: 'DIMENSION_MISMATCH' };
            }

            return { state: 'VALID' };
        } catch (error) {
            console.error('Image validation error:', error);
            return { state: 'INVALID_IMAGE' };
        }
    }
}

module.exports = ThumbnailInstructionValidator;
