const axios = require('axios');

const geosearch = async (q, limit = '1') => {
  const params = new URLSearchParams({
    q,
    limit,
    format: 'json',
  });

  const ENDPOINT = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

  try {
    const response = await axios.get(ENDPOINT);
    const payload = response.data;

    if (!payload || !payload.length) {
      throw new Error(`No response for Address: ${q}`);
    }

    return payload;
  } catch (error) {
    console.error(`Error during geosearch for Address: ${q}`, error);
    throw error;
  }
};

module.exports = geosearch;
