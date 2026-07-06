import "dotenv/config";
import weaviate from "weaviate-client";
import fs from "fs";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import pdfParse from "pdf-parse-fork"; // <-- importación directa

async function seedWeaviate() {
  console.log("Seeding Weaviate...");
  const client = await weaviate.connectToLocal({
    port: 8099,
    grpcPort: 50051,
  });

  const collectionName = "TestWeaviate";

  try {
    await client.collections.delete(collectionName);
  } catch (e) {}

  await client.collections.create({
    name: collectionName,
    vectorizers: weaviate.configure.vectorizer.text2VecOllama({
      apiEndpoint: process.env.OLLAMA_US_URL,
      model: "nomic-embed-text",
    }),
    properties: [
      { name: "texto", dataType: "text" },
      { name: "origen", dataType: "text" },
    ],
  });
  console.log("The collection has been successfully created.");

  // Leer PDF
  const pdfRoute = "./IR-G1-14-ERS.pdf";
  const dataBuffer = fs.readFileSync(pdfRoute);
  const pdfData = await pdfParse(dataBuffer); // <-- uso correcto
  const pdfText = pdfData.text;

  // Chunking
  console.log("Executing text chunking...");
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 400,
    chunkOverlap: 50,
    separators: ["\n\n", "\n", ".", " ", ""],
  });

  const chunks = await textSplitter.createDocuments([pdfText]);
  console.log(
    `The pdf has been successfully chunked in ${chunks.length} fragments.`,
  );

  const documents = chunks.map((chunk, index) => ({
    texto: chunk.pageContent,
    origen: `IR-G1-14-ERS.pdf (Parte: ${index + 1})`,
  }));

  const collection = client.collections.get(collectionName);
  await collection.data.insertMany(documents);

  console.log("Documents successfully inserted into the database.");
  client.close();
}

seedWeaviate().catch(console.error);
