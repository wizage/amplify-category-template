module.exports = (context) => {
    context.removeTemplate = async () => {
      await removeTemplate(context);
    };
};

async function removeTemplate(context){
    context.amplify.removeResource(context, 'custom');
}