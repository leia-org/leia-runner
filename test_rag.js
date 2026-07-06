const ollama = require("ollama").default;
const weaviate = require("weaviate-client");

async function test() {
  const client = await weaviate.connectToLocal({ port: 8099, grpcPort: 50051 });
  const collection = client.collections.get("TestWeaviate");

  const message = "gestion de citas";
  const searchResult = await collection.query.nearText(message, {
    limit: 3,
    returnProperties: ["texto", "origen"],
  });

  let RAGcontext = "";
  if (searchResult.objects && searchResult.objects.length > 0) {
    RAGcontext = searchResult.objects
      .map((obj, index) => {
        return `\n--- Documento ${index + 1} (Origen: ${obj.properties.origen}) ---\n${obj.properties.texto}\n`;
      })
      .join("\n");
  }

  console.log("=== RAG CONTEXT RECUPERADO ===");
  console.log("Num documentos:", searchResult.objects.length);
  console.log("Longitud contexto:", RAGcontext.length, "caracteres");
  console.log("===========================");

  const promptPotenciado = `
Answer the user's question. If applicable, use the following context extracted from the database:
${RAGcontext}

User's question: ${message}
`;

  console.log("\n=== RESPUESTA DEL MODELO ===");
  const response = await ollama.chat({
    model: "gemma3:1b",
    messages: [{ role: "user", content: promptPotenciado }],
    options: { num_ctx: 8192 },
  });

  console.log(response.message.content);
  console.log("==========================");

  client.close();
}

test().catch((e) => {
  console.error(e);
  process.exit(1);
});
