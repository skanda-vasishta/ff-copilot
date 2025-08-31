import boto3
import os
from pathlib import Path
from dotenv import load_dotenv
from botocore.exceptions import ClientError, NoCredentialsError

load_dotenv()

class S3Uploader:
    def __init__(self, bucket_name='ff-copilot-store'):
        self.bucket_name = bucket_name
        self.s3_client = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize S3 client with credentials from environment or AWS profile"""
        try:
            # Try to create S3 client (will use AWS credentials from environment or ~/.aws/)
            self.s3_client = boto3.client('s3')
            print("S3 client initialized successfully")
        except NoCredentialsError:
            print("AWS credentials not found. Please set up your credentials:")
            print("   - Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables")
            print("   - Or configure AWS CLI with 'aws configure'")
            print("   - Or use IAM roles if running on AWS")
            raise
    
    def upload_file(self, local_file_path, s3_key=None):
        """
        Upload a file to S3 bucket
        
        Args:
            local_file_path (str): Path to the local file to upload
            s3_key (str, optional): S3 key (path) for the uploaded file. 
                                   If None, uses the filename
        
        Returns:
            bool: True if successful, False otherwise
        """
        if not self.s3_client:
            print("S3 client not initialized")
            return False
            
        # Convert to Path object for easier handling
        file_path = Path(local_file_path)
        
        # Check if file exists
        if not file_path.exists():
            print(f"File not found: {file_path}")
            return False
        
        # Use filename as S3 key if not provided
        if s3_key is None:
            s3_key = file_path.name
            
        try:
            print(f"Uploading {file_path} to s3://{self.bucket_name}/{s3_key}")
            
            # Upload the file
            self.s3_client.upload_file(
                str(file_path), 
                self.bucket_name, 
                s3_key
            )
            
            print(f"Successfully uploaded to s3://{self.bucket_name}/{s3_key}")
            return True
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'NoSuchBucket':
                print(f"Bucket '{self.bucket_name}' does not exist")
            elif error_code == 'AccessDenied':
                print(f"Access denied to bucket '{self.bucket_name}'")
            else:
                print(f"AWS error: {e}")
            return False
        except Exception as e:
            print(f"Unexpected error: {e}")
            return False
    
    def list_files(self, prefix=""):
        """List files in the S3 bucket"""
        if not self.s3_client:
            print("S3 client not initialized")
            return []
            
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix
            )
            
            if 'Contents' in response:
                files = [obj['Key'] for obj in response['Contents']]
                print(f"Files in s3://{self.bucket_name}/{prefix}:")
                for file in files:
                    print(f"   - {file}")
                return files
            else:
                print(f"No files found in s3://{self.bucket_name}/{prefix}")
                return []
                
        except ClientError as e:
            print(f"Error listing files: {e}")
            return []
    
    def clear_bucket(self):
        """Delete all files in the S3 bucket"""
        if not self.s3_client:
            print("S3 client not initialized")
            return False
            
        try:
            print(f"Clearing all files from s3://{self.bucket_name}/")
            
            # List all objects in the bucket
            response = self.s3_client.list_objects_v2(Bucket=self.bucket_name)
            
            if 'Contents' not in response:
                print("Bucket is already empty")
                return True
            
            # Delete all objects
            objects_to_delete = [{'Key': obj['Key']} for obj in response['Contents']]
            
            if objects_to_delete:
                delete_response = self.s3_client.delete_objects(
                    Bucket=self.bucket_name,
                    Delete={'Objects': objects_to_delete}
                )
                
                deleted_count = len(delete_response.get('Deleted', []))
                print(f"Successfully deleted {deleted_count} files from bucket")
            
            return True
            
        except ClientError as e:
            print(f"Error clearing bucket: {e}")
            return False
        except Exception as e:
            print(f"Unexpected error clearing bucket: {e}")
            return False
    
    def download_file(self, s3_key, local_file_path):
        """Download a file from S3"""
        if not self.s3_client:
            print("S3 client not initialized")
            return False
            
        try:
            print(f"Downloading s3://{self.bucket_name}/{s3_key} to {local_file_path}")
            
            self.s3_client.download_file(
                self.bucket_name,
                s3_key,
                local_file_path
            )
            
            print(f"Successfully downloaded to {local_file_path}")
            return True
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'NoSuchKey':
                print(f"File '{s3_key}' not found in bucket")
            else:
                print(f"AWS error: {e}")
            return False
        except Exception as e:
            print(f"Unexpected error: {e}")
            return False


def main():
    """Clear bucket and upload specific data files"""
    uploader = S3Uploader()
    
    # Step 1: Clear the entire bucket
    print("Starting bucket refresh process...")
    if not uploader.clear_bucket():
        print("Failed to clear bucket, aborting...")
        return
    
    # Step 2: Upload the specific files
    files_to_upload = [
        # ("../data/player_stats.csv", "player_stats.csv"),
        # ("../data/player_scraped_info.csv", "player_scraped_info.csv")
        ("../player_stats.csv", "player_stats.csv"),
        ("../player_scraped_info.csv", "player_scraped_info.csv")
    ]
    
    print("\nUploading fresh data files...")
    success_count = 0
    
    for local_path, s3_key in files_to_upload:
        if Path(local_path).exists():
            if uploader.upload_file(local_path, s3_key):
                success_count += 1
            else:
                print(f"Failed to upload {local_path}")
        else:
            print(f"File not found: {local_path}")
    
    # Step 3: Verify uploads
    print(f"\nUpload complete! {success_count}/{len(files_to_upload)} files uploaded successfully")
    print("\nFinal bucket contents:")
    uploader.list_files()


if __name__ == "__main__":
    main()
