async function executeAmplifyCommand(context) {
    let commandPath = path.normalize(path.join(__dirname, 'commands'));
    if (context.input.command === 'help') {
      commandPath = path.join(commandPath, category);
    } else {
      commandPath = path.join(commandPath, category, context.input.command);
    }
    
    const commandModule = require(commandPath);
    await commandModule.run(context);
  }

  module.exports = {
    executeAmplifyCommand,
  };