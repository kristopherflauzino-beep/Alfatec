process.env.V2_STORAGE_MODE = process.env.V2_STORAGE_MODE || "blob";

const { handleRequest } = require("../v2/backend/server");

module.exports = async (request, response) => {
  const rawPath = `${request.query?.path || ""}`.trim().replace(/^\/+/, "");
  request.url = rawPath ? `/api/${rawPath}` : "/api";
  await handleRequest(request, response);
};
