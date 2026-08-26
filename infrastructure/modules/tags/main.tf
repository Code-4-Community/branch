# Single source of truth for the tags on every AWS resource. Consumed through
# `default_tags` in each root module's provider, so no resource repeats them.
output "tags" {
  value = {
    Project = "branch"
  }
}
