import * as util from 'util';
import {
  pipeline as pipelineSync,
  Readable,
} from 'stream';
import {
  LambdaFunctionURLEvent,
  Context,
  Handler,
} from "aws-lambda";
import {
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

const BUCKET_NAME = process.env.BUCKET_NAME;

const pipeline = util.promisify(pipelineSync);

const s3 = new S3Client({});

export const handler: Handler = awslambda.streamifyResponse(
  async (event: LambdaFunctionURLEvent, responseStream: NodeJS.WritableStream, context: Context) => {
    try {
      console.debug(event);

      const objectKey = event.requestContext.http.path.replace(/^\//, '');

      const req = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey,
      });
      console.debug(req);

      const res = await s3.send(req);
      console.debug(res);

      if (res.$metadata.httpStatusCode != 200){
        throw new Error('Error');
      }

      console.info({ 'objectKey': objectKey, 'contentType': res.ContentType, });

      // const httpResponseMetadata = {
      //   statusCode: 200,
      //   headers: {
      //     'Content-Type': 'application/pdf',
      //     'X-Custom-Header': 'Example-Custom-Header'
      //   },
      // };
      // awslambda.HttpResponseStream.from(responseStream, httpResponseMetadata);
      responseStream.setContentType(res.ContentType);
      await pipeline(res.Body as Readable, responseStream);
    }
    catch (err) {
      console.error(err);
      responseStream.setContentType('text/plain');
      responseStream.write('Error!');
      responseStream.end();
    }
  }
);
