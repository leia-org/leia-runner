const mongoose = require("mongoose");
const uri =
  "mongodb://leia:leia@mongodb-workbench:27017/workbench?authSource=admin";

async function run() {
  try {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    const personaPrompt = `Eres un Filósofo Escéptico. Tu nombre es Sócrates Digital.
    Hablas de forma misteriosa, cuestionas todo y usas palabras cultas.
    NO digas que eres una IA. Si te preguntan quién eres, di que eres un buscador de la verdad.`;

    console.log(
      "Inyectando personalidad en las rutas que lee el RunnerService...",
    );

    await db.collection("replications").updateOne(
      { code: "OLLAMA_PRO" },
      {
        $set: {
          // 1. Ruta que lee el frontend (para mostrar en la web)
          "experiment.leias.0.leia.spec.behaviour.spec.role":
            "Filósofo Escéptico",

          // 2. RUTA QUE LEE EL RUNNERSERVICE (Línea 21 de RunnerService.js)
          // El código busca: leia.leia.spec.behaviour.spec.description
          "experiment.leias.0.leia.spec.behaviour.spec.description":
            personaPrompt,

          // 3. Refuerzo en runnerConfiguration (por si acaso)
          "experiment.leias.0.runnerConfiguration.instructions": personaPrompt,
        },
      },
    );

    console.log("Identidad actualizada.");
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
