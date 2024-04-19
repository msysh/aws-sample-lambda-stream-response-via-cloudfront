import * as cdk from 'aws-cdk-lib';
import { Stack } from '../lib/stack';

const app = new cdk.App();
new Stack(app, 'LambdaStreamingResponseStack', {
  description: 'Lambda Streaming Response Test for downloading a large file.'
});