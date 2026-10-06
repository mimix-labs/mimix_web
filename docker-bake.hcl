variable "REGISTRY" { default = "mimix" }
variable "RELEASE" { default = "dev" }
group "default" { targets = ["runtime", "simulator"] }
target "common" {
  context = "."
  dockerfile = "Dockerfile"
  platforms = ["linux/amd64", "linux/arm64"]
}
target "runtime" {
  inherits = ["common"]
  target = "production"
  tags = ["${REGISTRY}-runtime:${RELEASE}"]
}
target "simulator" {
  inherits = ["common"]
  target = "simulator"
  tags = ["${REGISTRY}-simulator:${RELEASE}"]
}
