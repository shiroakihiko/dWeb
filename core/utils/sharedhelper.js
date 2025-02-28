const Hasher = require('./hasher.js');

class SharedHelper {
    // Sorts the object by key and returns a stringified version of it
    static canonicalStringify(obj) {
        const sortedObj = Object.keys(obj)
        .sort()
        .reduce((acc, key) => {
            acc[key] = obj[key];
            return acc;
        }, {});
        return JSON.stringify(sortedObj);
    }

    // Hashes the text
    static async hashText(text) {
        return await Hasher.hashText(text);
    }
}

module.exports = SharedHelper;