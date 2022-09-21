const prompt = require("prompt-sync")({ sigint: true });
const fs = require("fs");
const IoniteRepl = require("./ionite.compiler")

if (process.argv[2] != null) {
    console.log(`Reading file ${process.argv[2]}`)

    const file = fs.readFileSync(process.argv[2]).toString()
    
    IoniteRepl.eval(file)
    
    return
}

IoniteRepl.lifecycle.init()

while (!IoniteRepl.get_state().finished) {
    const input = prompt("> ")

    IoniteRepl.eval_line(input)
}