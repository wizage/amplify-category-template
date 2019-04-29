const featureName = 'template';

module.exports = {
  name: featureName,
  run: async (context) => {
    if (/^win/.test(process.platform)) {
      try {
        const { run } = require(`./${featureName}/${context.parameters.first}`);
        return run(context);
      } catch (e) {
        context.print.error('Command not found');
      }
    }
    const header = `amplify ${featureName} <subcommand>`;

    const commands = [
      {
        name: 'add',
        description: `Takes you through a CLI flow to add a ${featureName} resource to your local backend`,
      },
      {
        name: 'remove',
        description: `Removes ${featureName} resource from your local backend and will remove them on amplify push`,
      }
    ];

    context.amplify.showHelp(header, commands);

    context.print.info('');
  },
};