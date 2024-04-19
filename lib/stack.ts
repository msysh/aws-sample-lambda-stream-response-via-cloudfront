import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -----------------------------
    // S3
    // -----------------------------
    const bucket = new cdk.aws_s3.Bucket(this, 'Bucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // -----------------------------
    // Lambda
    // -----------------------------
    const policyDocument = new cdk.aws_iam.PolicyDocument({
      statements:[
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
          ],
          resources: [
            `${bucket.bucketArn}/*`,
          ]
        }),
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: [
            'xray:PutTraceSegments',
            'xray:PutTelemetryRecords',
          ],
          resources: [ '*' ],
        }),
      ]
    });

    const role = new cdk.aws_iam.Role(this, 'FunctionRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        'policy': policyDocument
      }
    });

    const lambdaFunction = new cdk.aws_lambda_nodejs.NodejsFunction(this, 'LambdaFunction', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      entry: 'assets/functions/streaming-lambda/index.ts',
      handler: 'handler',
      bundling: {
        minify: true,
        tsconfig: 'assets/functions/streaming-lambda/tsconfig.json',
        format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
      },
      environment: {
        BUCKET_NAME: bucket.bucketName,
      },
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      awsSdkConnectionReuse: true,
      role: role,
      timeout: cdk.Duration.minutes(15),
      loggingFormat: cdk.aws_lambda.LoggingFormat.JSON,
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      applicationLogLevel: cdk.aws_lambda.ApplicationLogLevel.DEBUG,
      // tracing: cdk.aws_lambda.Tracing.ACTIVE,
    });

    // Function URLs
    const lambdaFunctionUrl = lambdaFunction.addFunctionUrl({
      authType: cdk.aws_lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: cdk.aws_lambda.InvokeMode.RESPONSE_STREAM,
    });

    // -----------------------------
    // CloudFront Distribution
    // -----------------------------
    const distribution = new cdk.aws_cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new cdk.aws_cloudfront_origins.FunctionUrlOrigin(lambdaFunctionUrl),
        viewerProtocolPolicy: cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cdk.aws_cloudfront.CachePolicy.CACHING_DISABLED,
        responseHeadersPolicy: cdk.aws_cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
    });

    // for Origin Access Control
    const cfnOriginAccessControl = new cdk.aws_cloudfront.CfnOriginAccessControl(this, 'OriginAccessControl', {
      originAccessControlConfig: {
        name: 'OriginAccessControlForLambdaFunctionUrls',
        originAccessControlOriginType: 'lambda',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
        description: 'Lambda Function URLs Control',
      },
    });
    const cfnDistribution = distribution.node.defaultChild as cdk.aws_cloudfront.CfnDistribution;
    cfnDistribution.addPropertyOverride('DistributionConfig.Origins.0.OriginAccessControlId', cfnOriginAccessControl.attrId);

    // Lambda permission
    lambdaFunction.addPermission('AllowCloudFrontServicePrincipal', {
      principal: new cdk.aws_iam.ServicePrincipal('cloudfront.amazonaws.com'),
      action: 'lambda:InvokeFunctionUrl',
      sourceArn: `arn:aws:cloudfront::${cdk.Stack.of(this).account}:distribution/${distribution.distributionId}`,
    });

    // -----------------------------
    // Output
    // -----------------------------
    new cdk.CfnOutput(this, 'Output-CloudFrontDistributionUrl', {
      description: 'CloudFront Distribution URL',
      value: `https://${distribution.distributionDomainName}/`,
    });

    new cdk.CfnOutput(this, 'Output-S3BucketName', {
      description: 'S3 Bucket Name',
      value: bucket.bucketName,
    });
  }
}
