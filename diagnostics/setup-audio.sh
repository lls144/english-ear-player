#!/usr/bin/env bash
set -euo pipefail
test "${GITHUB_ACTIONS:-}" = true
test "${RUNNER_OS:-}" = Linux
sudo apt-get update -qq
sudo apt-get install -y pulseaudio pulseaudio-utils gstreamer1.0-pulseaudio
ear_runtime="${RUNNER_TEMP}/ear-audio"
mkdir -p "$ear_runtime"
chmod 700 "$ear_runtime"
export XDG_RUNTIME_DIR="$ear_runtime"
unset PULSE_SERVER
pulseaudio --start --exit-idle-time=-1 --log-target=stderr
export PULSE_SERVER="unix:${ear_runtime}/pulse/native"
pactl load-module module-null-sink sink_name=ear_test rate=48000 channels=2
pactl set-default-sink ear_test
pactl unload-module module-suspend-on-idle || true
pactl suspend-sink ear_test 0
printf '%s\n' "XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR" "PULSE_SERVER=$PULSE_SERVER" 'PULSE_SINK=ear_test' 'EAR_CI_AUDIO_SINK=ear_test' >> "$GITHUB_ENV"
pactl info
pactl list sinks short
