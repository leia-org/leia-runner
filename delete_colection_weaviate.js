// En un archivo test.js
const weaviate = require("weaviate-client");
async function run() {
  const client = await weaviate.connectToLocal({ port: 8099, grpcPort: 50051 });
  await client.collections.delete("TestWeaviate");
  console.log("Colección borrada. Vuelve a crearla e indexar tus datos.");
  client.close();
}
run();
