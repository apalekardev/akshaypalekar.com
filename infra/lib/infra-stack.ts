import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3Deployment from '@aws-cdk/aws-s3-deployment';
import { CloudFrontWebDistribution, OriginAccessIdentity } from '@aws-cdk/aws-cloudfront';
import { stageId, StageStackProps } from "./common";

export class InfraStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: StageStackProps) {
    super(scope, stageId(id, props.stage), props);

    const envContext = this.node.tryGetContext(props.stage);

        // Creates a bucket for the front end
        const sourceBucket = new s3.Bucket(this, stageId('bucket', props.stage), {
            bucketName: envContext.bucketName,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        //Create the OAI to lock S3 bucket to be access only via CDN
        const oai = new OriginAccessIdentity(this, stageId('origin-access', props.stage), {
            comment: "Connects " + envContext.bucketName + " to " + props.stage + " CDN"
        });

        sourceBucket.grantRead(oai);

        new cdk.CfnOutput(this, stageId('bucket-name', props.stage), { value: sourceBucket.bucketName });

        // Creates the CDN distribution
        const distribution = new CloudFrontWebDistribution(this, stageId('distribution', props.stage), {
            originConfigs: [
                {
                    s3OriginSource: {
                        s3BucketSource: sourceBucket,
                        originAccessIdentity: oai,
                    },
                    behaviors: [{ isDefaultBehavior: true }]
                }
            ],
            viewerCertificate: {
                aliases: envContext.frontendDomains,
                props: {
                    acmCertificateArn: envContext.frontendCertificateArn,
                    sslSupportMethod: 'sni-only',
                    minimumProtocolVersion: 'TLSv1.1_2016'
                }
            },
            errorConfigurations: [
                {
                    errorCode: 403,
                    responseCode: 200,
                    responsePagePath: '/index-dark.html',
                    errorCachingMinTtl: 10
                },
                {
                    errorCode: 404,
                    responseCode: 200,
                    responsePagePath: '/index-dark.html',
                    errorCachingMinTtl: 10
                },
            ],
        });

        new cdk.CfnOutput(this, stageId('distribution-id', props.stage), { value: distribution.distributionId });

        //Deploys the bucket
        new s3Deployment.BucketDeployment(this, stageId('bucket-deployment', props.stage), {
            sources: [s3Deployment.Source.asset('../static-files')],
            destinationBucket: sourceBucket,
            distribution: distribution,
            distributionPaths: ['/*'],
        });
  }
}
