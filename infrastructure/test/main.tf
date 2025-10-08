resource "aws_instance" "example" {
  ami           = "resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
  instance_type = "t3.micro"

  tags = {
    Name = "HelloWorld"
  }
}

# This resource creates an EC2 instance for the web application
# It uses the latest Amazon Linux 2 AMI and t3.micro instance type
resource "aws_instance" "web" {
  ami           = "ami-12345678"
  instance_type = "t3.micro"
}