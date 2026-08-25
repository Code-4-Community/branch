# Published to Actions as `vars.AWS_ACCOUNT_ID`. Changing this and applying is
# the whole switchover for CI when the infrastructure moves accounts.
variable "aws_account_id" {
  description = "AWS account hosting the BRANCH infrastructure"
  type        = string
  default     = "489881683177"
}

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

# ── PR Review Bot ────────────────────────────────────────────

variable "review_bot_roster" {
  description = "Ordered list of GitHub usernames for round-robin review assignment"
  type        = list(string)
  default     = ["Rayna-Yu", "mehanana", "tsudhakar87", "Vaibhav978", "shreeyaadhikari"]
}

variable "review_bot_github_to_slack" {
  description = "Map of GitHub username → Slack member ID (U0…)"
  type        = map(string)
  default = {
    "Rayna-Yu"        = "U083UGSCU7P"
    "mehanana"        = "U084AMND8FK"
    "tsudhakar87"     = "U08NFFSJEG1"
    "nourshoreibah"   = "U07NGFM1QKE"
    "Vaibhav978"      = "U0A6HAVCRMJ"
    "shreeyaadhikari" = "U0ASA92G3QV"
  }
}

variable "review_bot_always_reviewer_slack" {
  description = "Slack member ID of the person who reviews every PR"
  type        = string
  default     = "U07NGFM1QKE"
}

variable "review_bot_slack_channel_id" {
  description = "Slack channel ID where review notifications are posted"
  type        = string
  default     = "C0ADQN0B6F8"
}
