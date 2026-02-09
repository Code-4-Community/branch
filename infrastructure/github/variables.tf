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
  default     = ["denniwang", "bhuvanh66", "Rayna-Yu", "mehanana", "tsudhakar87", "saumyapalk23"]
}

variable "review_bot_github_to_slack" {
  description = "Map of GitHub username → Slack member ID (U0…)"
  type        = map(string)
  default = {
    "denniwang"     = "U07F8LM2X61"
    "bhuvanh66"     = "U084JKT1GG2"
    "Rayna-Yu"      = "U083UGSCU7P"
    "mehanana"      = "U084AMND8FK"
    "tsudhakar87"   = "U08NFFSJEG1"
    "saumyapalk23"  = "U09EYETUEGP"
    "nourshoreibah" = "U07NGFM1QKE"
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
  default     = "C09DGFG5JR4"
}
