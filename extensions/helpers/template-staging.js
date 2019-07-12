const path = require('path');
const mime = require('mime-types');
const fs = require('fs');

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

module.exports = {
    copyFilesToS3
}