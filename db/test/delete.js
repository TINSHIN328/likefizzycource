const { queryParams } = require('../db');

async function deleteChannelsent() {
    try {
        const result = await queryParams(
            "UPDATE controlbot SET channelsent = NULL WHERE id = ?",
            [1]
        );

        console.log('Deleted channelsent for id 1');
    } catch (err) {
        console.error("Error deleting channelsent:", err);
    }
}

deleteChannelsent().catch((err) => {
    console.error('Error in deleteChannelsent function:', err);
});
