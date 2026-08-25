import {
  to = github_repository.branch
  id = "branch"
}

# Set by hand before this was introduced, and it had to be: every workflow's
# role ARN interpolates vars.AWS_ACCOUNT_ID, so CI cannot assume a role -- and
# therefore cannot apply this module -- until the variable already exists.
import {
  to = github_actions_variable.aws_account_id
  id = "branch:AWS_ACCOUNT_ID"
}
