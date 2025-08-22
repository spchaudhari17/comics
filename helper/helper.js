var AWS = require('aws-sdk');


let upload_files = async (folder, files)=>{

    if (files) {


        let image = files;
        let dateTime = Date.now();
        let imageName = dateTime + "_" + image.name

        AWS.config.update({
            accessKeyId: process.env.AWS_KEY,
            secretAccessKey: process.env.AWS_SECRET,
            region: 'eu-north-1'
        });

        const s3 = new AWS.S3();

        // Read content from the file

        const fileContent = Buffer.from(image.data, 'binary');

          // Setting up S3 upload parameters
        const params = {
            Bucket: process.env.BUCKET_NAME,
            Key: folder+'/' + imageName, // File name you want to save as in S3
            Body: fileContent,
            ContentType: image.mimetype,
        };

        // Uploading files to the bucket
        
        try {
            
           var s3image = await s3.upload(params).promise();

        } catch (e) {
            return "Error uploading data: "+e;
        }

    }

    let imagePath =  s3image?s3image.Location:'';

    return imagePath;
}


const deleteFiles = async (folder, fileName)=>{


    AWS.config.update({
        accessKeyId: process.env.AWS_KEY,
        secretAccessKey: process.env.AWS_SECRET,
        region: 'eu-north-1'
    });

    const s3 = new AWS.S3();

    const params = {
        Bucket: process.env.BUCKET_NAME,
        Key:folder+"/"+fileName
    };
   
    try {
            
     await s3.deleteObject(params).promise();

     return 1

    } catch (e) {
        return e;
    }


}


module.exports = {upload_files, deleteFiles}