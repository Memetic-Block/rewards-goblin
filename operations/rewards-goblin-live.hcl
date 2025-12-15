job "rewards-goblin-live" {
  datacenters = [ "mb-hel" ]
  type = "service"

  constraint {
    attribute = "${meta.env}"
    value     = "worker"
  }

  update {
    max_parallel      = 1
    health_check      = "checks"
    min_healthy_time  = "10s"
    healthy_deadline  = "5m"
    progress_deadline = "10m"
    auto_revert       = true
    auto_promote      = true
    canary            = 1
    stagger           = "30s"
  }

  group "rewards-goblin-live-group" {
    count = 1

    network {
      mode = "bridge"
      port "http" {
        host_network = "wireguard"
      }
    }

    task "rewards-goblin-live-task" {
      driver = "docker"

      config {
        image = "${CONTAINER_REGISTRY_ADDR}/memetic-block/rewards-goblin:${VERSION}"
        volumes = [
          "secrets/wallet.json:/usr/src/app/wallet.json:ro"
        ]
      }

      env {
        VERSION="[[ .commit_sha ]]"
        PORT="${NOMAD_PORT_http}"
        REDIS_MODE="standalone"
        AO_WALLET_JWK_PATH="/usr/src/app/wallet.json"
        AO_CHEESE_MINT_PROCESS_ID="uvwZhbu8XTiS3vGlgn7OlaEV_r84opf7VjoNns0w3kY"
      }

      template {
        data = <<-EOF
        {{- range service "rewards-goblin-redis-live" }}
        REDIS_HOST="{{ .Address }}"
        REDIS_PORT="{{ .Port }}"
        {{- end }}
        {{- range service "container-registry" }}
        CONTAINER_REGISTRY_ADDR="{{ .Address }}:{{ .Port }}"
        {{- end }}
        {{- range service "wuzzy-cu" }}
        CU_URL="http://{{ .Address }}:{{ .Port }}"
        {{- end }}
        EOF
        env = true
        destination = "local/config.env"
      }

      vault { policies = [ "rewards-goblin-live" ] }

      template {
        data = "{{ with secret `kv/wuzzy/rewards-goblin-live` }}{{ base64Decode .Data.data.WALLET_JWK_BASE64 }}{{ end }}"
        destination = "secrets/wallet.json"
      }

      resources {
        cpu    = 1024
        memory = 1024
      }

      service {
        name = "rewards-goblin-live"
        port = "http"

        check {
          type     = "http"
          path     = "/health"
          interval = "10s"
          timeout  = "10s"
        }
      }
    }
  }
}
