const questions = require('./questions.json')
const fs = require('fs')
const inquirer = require('inquirer')

module.exports = (context) => {
    context.createTemplate = async () => {
      await createTemplate(context);
    };
};

async function createTemplate(context){
    const questionArray = questions.template.inputs;

    const nameProject = [
        {
          type: questionArray[0].type,
          name: questionArray[0].key,
          message: questionArray[0].question,
          validate: amplify.inputValidation(questionArray[0]),
          default: amplify.getProjectDetails().projectConfig.projectName,
    }];

    let resource = await inquirer.prompt(nameProject);

    let location = await askLocationQuestions();
    location.projectName = resource.name;

}

async function prepareCloudFormation(context, result){
    let split = result.root.split('.');
    let ending = split[split.length-1];
    if (ending.endingtoLowerCase() === 'json'){
        await handleJSON(context, result);
    } else if (ending.endingtoLowerCase() === 'yaml'){
        await handleYAML(result);
    } else {
        console.log('Error! Can\'t find ending');
    }
}

async function handleYAML(reuslt){

}

async function handleJSON(context, result){
    const { amplify } = context;
    const targetBucket = amplify.getProjectMeta().providers.awscloudformation.DeploymentBucketName;
    const rootTemplate = JSON.parse(fs.readFileSync(result.root));
    if (!rootTemplate.Parameters){
        rootTemplate.Parameters = {}
    } 
    if (!rootTemplate.Parameters.env) {
        rootTemplate.Parameters.env = {
            Type :"String",
            Description: "The environment name. e.g. Dev, Test, or Production",
            Default: "NONE"
        }
    }
    if (result.nestedTemplate === "YES"){
        //await migrateNestedURLS(Object.keys(rootTemplate.Resources), rootTemplate.Resources, context, result);
        Object.keys(rootTemplate.Resources).forEach(resource => {
            let urlSplit = rootTemplate.Resources[resource].Properties.TemplateURL.split('/');
            let filename = urlSplit[urlSplit.length-1];
            rootTemplate.Resources[resource].Properties.TemplateURL = "https://s3.amazonaws.com/" + targetBucket + "/amplify-cfn-templates/" + result.projectName + "/" + filename;
        });
    }
}

async function migrateNestedURLS(resourceKeys, resources, context, result){
    resourceKeys.forEach(resource => {
        let urlSplit = resources[resource].Properties.TemplateURL.split('/');
        let filename = urlSplit[urlSplit.length-1];
        rootTemplate.Resources[resource].Properties.TemplateURL = "https://s3.amazonaws.com/" + targetBucket + "/amplify-cfn-templates/" + result.projectName + "/" + filename;
    });
}

async function askLocationQuestions(){
    const inputs = questions.template.inputs;
    let results = {};
    const isNestedTemplateQ = [
        {
          type: inputs[2].type,
          name: inputs[2].key,
          message: inputs[2].question,
          choices: inputs[2].options,
          default: "NO"
        },
    ];

    const rootLocationQ = [
        {
          type: inputs[3].type,
          name: inputs[3].key,
          message: inputs[3].question,
          choices: inputs[3].options,
          default: ""
        },
    ];

    const nestedFolderQ = [
        {
          type: inputs[4].type,
          name: inputs[4].key,
          message: inputs[4].question,
          choices: inputs[4].options,
          default: ""
        },
    ];
    while (results.root === undefined){
        const rootLocation = await inquirer.prompt(rootLocationQ);
        if (fs.existsSync(rootLocation.rootLocation)) {
            results.root = rootLocation.rootLocation;
        }
    }

    const isNestedTemplate = await inquirer.prompt(isNestedTemplateQ);
    results.isNestedTemplate = isNestedTemplate.nestedTemplate;
    if (isNestedTemplate.nestedTemplate === "YES"){
        while (results.nestedFolder === undefined){
            let nestedFolder = await inquirer.prompt(nestedFolderQ);
            if(fs.existsSync(nestedFolder.folderLocation)){
                results.nestedFolder = nestedFolder.folderLocation;
            }
        }
    }

    return results;
}