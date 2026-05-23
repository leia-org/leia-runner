const { GoogleGenAI } = require("@google/genai");
const prompts = require("../utils/prompts");
const sharp = require("sharp");

const MAX_AVATAR_BYTES = 4 * 1024;
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    const error = new Error("GEMINI_API_KEY is not configured");
    error.code = "invalid_api_key";
    throw error;
  }

  return new GoogleGenAI({ apiKey });
}

function extractImage(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => part.inlineData?.data);

  if (!imagePart) {
    throw new Error("Gemini did not return image data");
  }

  return Buffer.from(imagePart.inlineData.data, "base64");
}

async function compressAvatarToDataUrl(sourceBuffer) {
  const sizes = [96, 80, 64, 48, 40, 32];
  const qualities = [80, 70, 60, 50, 40, 30, 20];

  for (const size of sizes) {
    for (const quality of qualities) {
      const compressed = await sharp(sourceBuffer)
        .resize(size, size, { fit: "cover", position: "center" })
        .webp({ quality, effort: 6 })
        .toBuffer();
      const dataUrl = `data:image/webp;base64,${compressed.toString("base64")}`;

      if (Buffer.byteLength(dataUrl, "utf8") <= MAX_AVATAR_BYTES) {
        return dataUrl;
      }
    }
  }

  const fallback = await sharp(sourceBuffer)
    .resize(24, 24, { fit: "cover", position: "center" })
    .webp({ quality: 10, effort: 6 })
    .toBuffer();
  const dataUrl = `data:image/webp;base64,${fallback.toString("base64")}`;

  if (Buffer.byteLength(dataUrl, "utf8") > MAX_AVATAR_BYTES) {
    throw new Error("Unable to compress avatar below 4KB");
  }

  return dataUrl;
}

async function generatePersonaAvatar({ name, description, personality }) {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: prompts.personaAvatar({ name, description, personality }),
  });

  const sourceBuffer = extractImage(response);
  const avatar = await compressAvatarToDataUrl(sourceBuffer);

  return {
    avatar,
    sizeBytes: Buffer.byteLength(avatar, "utf8"),
  };
}

async function generateProblemAvatar(problem) {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: prompts.problemAvatar(problem),
  });

  const sourceBuffer = extractImage(response);
  const avatar = await compressAvatarToDataUrl(sourceBuffer);

  return {
    avatar,
    sizeBytes: Buffer.byteLength(avatar, "utf8"),
  };
}

module.exports = {
  generatePersonaAvatar,
  generateProblemAvatar,
};
