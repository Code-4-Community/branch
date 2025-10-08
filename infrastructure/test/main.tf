resource "aws_instance" "example" {
  ami           = "resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
  instance_type = "t3.micro"

  tags = {
    Name = "HelloWorld"
  }
}

# Intentionally cause plan to fail while keeping syntax valid:
# This data source queries a non-existent AMI ID, which will make
# terraform plan error out with a provider lookup failure.
data "aws_ami" "nonexistent" {
  owners      = ["self"]
  most_recent = true
  filter {
    name   = "image-id"
    values = ["ami-0000000000000000"]
  }
}

output "nonexistent_ami_id" {
  value = data.aws_ami.nonexistent.id
}

