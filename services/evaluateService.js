import('dotenv').then(dotenv => dotenv.config());

let openai;
(async () => {
    const OpenAI = await import("openai");
    openai = new OpenAI.default(process.env.OPENAI_API_KEY);
})();

async function getEvaluationUML(studentSolution, exerciseSolution) {
    const prompt = `Evaluate the following UML diagram:\n\nStudent's solution:\n${studentSolution}\n\nExercise's solution:\n${exerciseSolution} \n\n` +
        `You must give a brief explanation of the differences between the student's solution and the exercise's solution.` +
        `The student task is to create a UML diagram that represents a system, and the exercise's solution is the correct UML diagram of this system.` +
        `Keep in mind that although the student's solution may not be identical to the exercise's solution, it may still be correct.` +
        `For example, the student may have used different names for classes or methods, but the overall structure may be correct.` +
        `Name differences are will not be taken in account for the score.` +
        `Your responses should be in the form of paragraphs without enumerations, bullet points, or titles.` +
        `At the end of your response, please give a score from 0 to 10 to the student's solution, where 0 is the UML does not describe the expected exercise's solution system at all and 10 is the UML defines perfectly the system from the given exercise's solution as expected.` +
        `This score must be in the following format: "Score: X/10", where X is the score. Use a different line so the score is more visible` +
        `This response will be seen by the student who submitted the solution, so refer to the student correctly, using the second person and his solution as your solution.`;

    const evaluation = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: prompt
            }
        ],
    });

    return evaluation.choices[0].message.content;
}

module.exports.evaluate = async function evaluate(req, res) {
    const studentSolution = req.body.studentSolution;
    const exerciseSolution = req.body.exerciseSolution;
    const type = req.query.type;

    let evaluation;
    if (type === 'uml') {
        try {
            evaluation = await getEvaluationUML(studentSolution, exerciseSolution);
        } catch (error) {
            console.error(error);
            res.status(500).send({ error: 'Error evaluating the UML diagram' });
            return;
        }
    } else {
        res.status(400).send({ error: 'Bad Request' });
        return;
    }

    res.status(200).send({ evaluation: evaluation });
}