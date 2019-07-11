const questions = require('./questions.json');
const fs = require('fs');
const inquirer = require('inquirer');
const path = require('path');
const mime = require('mime-types');

module.exports = (context) => {
    context.createTemplate = async () => {
      await createTemplate(context);
    };
};

async function createTemplate(context){
    const { amplify } = context;
    const options = {
        service: 'custom',
        providerPlugin: 'awscloudformation',
    };
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
    location.options = options;
    prepareCloudFormation(context,location);
}

async function prepareCloudFormation(context, result){
    let split = result.root.split('.');
    let ending = split[split.length-1];
    result.ending = ending
    if (ending.toLowerCase() === 'json'){
        await handleJSON(context, result);
    } else if (ending.toLowerCase() === 'yaml'){
        await handleYAML(result);
    } else {
        console.log('Error! Can\'t find ending');
    }
}

async function handleYAML(reuslt){
    console.log("To be implemented");
}

async function handleJSON(context, result){
    const { amplify } = context;
    const targetBucket = amplify.getProjectMeta().providers.awscloudformation.DeploymentBucketName;
    let rootTemplate = JSON.parse(fs.readFileSync(result.root));
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
    if (result.isNestedTemplate === "YES"){
        //await migrateNestedURLS(Object.keys(rootTemplate.Resources), rootTemplate.Resources, result);
        Object.keys(rootTemplate.Resources).forEach(resource => {
            let urlSplit = rootTemplate.Resources[resource].Properties.TemplateURL.split('/');
            /* For making sure that we don't lose filenames */
            if (urlSplit.length == 0){
                rootTemplate.Resources[resource].Properties.TemplateURL = "https://s3.amazonaws.com/" + targetBucket + "/amplify-cfn-templates/" + result.projectName + "/" + rootTemplate.Resources[resource].Properties.TemplateURL;
            } else {
                let filename = urlSplit[urlSplit.length-1];
                rootTemplate.Resources[resource].Properties.TemplateURL = "https://s3.amazonaws.com/" + targetBucket + "/amplify-cfn-templates/" + result.projectName + "/" + filename;
            }
        });
    }
    rootTemplate = await generateQuestions(context, rootTemplate)
    //Write out to root template and stage.
    fs.writeFileSync(result.root, JSON.stringify(rootTemplate, null, 4));
    await stageRoot(context, result);
}

async function generateQuestions(context, rootTemplate){
    const { amplify } = context;
    let questions = []

    Object.keys(rootTemplate.Parameters).forEach(key => {
        let question = {};
        let param = rootTemplate.Parameters[key];
        question.name = key;
        question.message = `${param.Description}`;
        question.default = (param.Default != undefined) ? param.Default : "";
        if (param.Type === "String" && param.AllowedPattern != undefined){
            question.type = "input";
            question.validation = {};
            question.validation.operator = "regex";
            let lengthRegex = "";
            if (param.MinLength != undefined || param.MaxLength != undefined ){
                lengthRegex = ((param.MinLength != undefined) ? `{${param.MinLength},` : "{,") + ((param.MaxLength != undefined) ? `${param.MaxLength}}` : "}");
                if (param.MaxLength == param.MinLength){
                    lengthRegex = `{${param.MaxLength}}`
                }
                if (param.AllowedPattern[param.AllowedPattern.length-1] === '*'){
                    param.AllowedPattern = param.AllowedPattern.slice(0,-1);
                }
            }
            question.validation.value = `^${param.AllowedPattern}` + ((lengthRegex != "") ? lengthRegex : "") + "$";
            question.validation.onErrorMesg = param.ConstraintDescription;
            question.validate = amplify.inputValidation(question);
            questions.push(question);
        } else if ((param.Type === "String" || param.Type === "Number") && param.AllowedValues != undefined){
            question.type = "list";
            question.choices = param.AllowedValues;
            questions.push(question);
        } else if (param.Type === "Number"){
            question.type = "number";
            question.validation = {};
            question.validation.operator = "range";
            question.validation.value = {};
            question.validation.value.min = ((param.MinValue != undefined) ? param.MinValue : Number.NEGATIVE_INFINITY);
            question.validation.value.max = ((param.MaxValue != undefined) ? param.MaxValue : Number.POSITIVE_INFINITY);
            question.validation.onErrorMesg = param.ConstraintDescription;
            question.validate = amplify.inputValidation(question);
            questions.push(question);
        } else {
            //Ignore and keep default :)
        }
        
    });

    const answers = await inquirer.prompt(questions);

    Object.keys(answers).forEach(key => {
        rootTemplate.Parameters[key].Default = answers[key];
    });
    return rootTemplate;
}

async function stageRoot(context, result){
    const { amplify } = context;
    const targetDir = amplify.pathManager.getBackendDirPath();
    const copyJobs = [
        {
          dir: '/',
          template: `${result.root}`,
          target: `${targetDir}/custom/${result.projectName}/${result.projectName}-${result.options.serviceType}-workflow-template.${result.ending}`,
        },
      ];
      context.amplify.updateamplifyMetaAfterResourceAdd(
        "custom",
        result.projectName,
        result.options,
      );
      await context.amplify.copyBatch(context, copyJobs, result);
      if (result.isNestedTemplate === "YES"){
        const fileuploads = fs.readdirSync(`${result.nestedFolder}`);

        if (!fs.existsSync(`${targetDir}/custom/${result.projectName}/src/`)) {
            fs.mkdirSync(`${targetDir}/custom/${result.projectName}/src/`);
        }

        fileuploads.forEach((filePath) => {
            fs.copyFileSync(`${result.nestedFolder}/${filePath}`, `${targetDir}/custom/${result.projectName}/src/${filePath}`);
        });
        copyFilesToS3(context, result.options, result)
      }
      
}

async function copyFilesToS3(context, options, props) {
    const { amplify } = context;
    const targetDir = amplify.pathManager.getBackendDirPath();
    const targetBucket = amplify.getProjectMeta().providers.awscloudformation.DeploymentBucketName;
    var provider;
    if ( typeof context.amplify.getPluginInstance === "function"){
      provider = context.amplify.getPluginInstance(context, options.providerPlugin);
    } else {
      console.log("Falling back to old version of getting AWS SDK. If you see this error you are running an old version of Amplify. Please update as soon as possible!");
      provider = getPluginInstanceShim(context, options.providerPlugin);
    }
  
    const aws = await provider.getConfiguredAWSClient(context);
    const s3Client = new aws.S3();
    const distributionDirPath = `${targetDir}/custom/${props.projectName}/src/`;
    const fileuploads = fs.readdirSync(distributionDirPath);
  
    fileuploads.forEach((filePath) => {
      uploadFile(s3Client, targetBucket, distributionDirPath, filePath, props.projectName);
    });
}
  
async function uploadFile(s3Client, hostingBucketName, distributionDirPath, filePath, projectName) {
    let relativeFilePath = path.relative(distributionDirPath, filePath);
  
    relativeFilePath = relativeFilePath.replace(/\\/g, '/');
  
    const fileStream = fs.createReadStream(`${distributionDirPath}/${filePath}`);
    const contentType = mime.lookup(relativeFilePath);
    const uploadParams = {
      Bucket: hostingBucketName,
      Key: `amplify-cfn-templates/${projectName}/${filePath}`,
      Body: fileStream,
      ContentType: contentType || 'text/plain',
      ACL: 'public-read',
    };
  
    s3Client.upload(uploadParams, (err) => {
      if (err) {
        console.log(chalk.bold('Failed uploading object to S3. Check your connection and try to run amplify livestream setup'));
      }
    });
}
async function askLocationQuestions(){
    const inputs = questions.template.inputs;
    let results = {};
    const isNestedTemplateQ = [
        {
          type: inputs[1].type,
          name: inputs[1].key,
          message: inputs[1].question,
          choices: inputs[1].options,
          default: "NO"
        },
    ];

    const rootLocationQ = [
        {
          type: inputs[2].type,
          name: inputs[2].key,
          message: inputs[2].question,
          choices: inputs[2].options,
          default: ""
        },
    ];

    const nestedFolderQ = [
        {
          type: inputs[3].type,
          name: inputs[3].key,
          message: inputs[3].question,
          choices: inputs[3].options,
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