variable "repository_collaborators" {
  description = "List of GitHub users to add as collaborators"
  type = list(object({
    username   = string
    permission = string
  }))
  default = [
    # {
    #   username   = "example-user"
    #   permission = "push"
    # }
  ]
}
