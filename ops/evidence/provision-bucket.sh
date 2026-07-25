#!/usr/bin/env bash
# Provisions the private evidence bucket and a least-privilege MinIO user.
# No credential value is ever echoed: the generated secret key goes straight
# into the Kubernetes Secret and is never written to a file or the log.
set -euo pipefail

bucket="dreambau-pr-evidence"
user="evidence-gateway"
policy="evidence-gateway-rw"
alias_name="wcrminio"
namespace="wcr"

root_user=$(kubectl -n wcr-storage get secret wcr-minio-secret -o jsonpath='{.data.rootUser}' | base64 -d)
root_password=$(kubectl -n wcr-storage get secret wcr-minio-secret -o jsonpath='{.data.rootPassword}' | base64 -d)

mc alias set "$alias_name" "http://127.0.0.1:31900" "$root_user" "$root_password" >/dev/null
unset root_password

if mc ls "$alias_name/$bucket" >/dev/null 2>&1; then
  echo "bucket already present: $bucket"
else
  mc mb "$alias_name/$bucket" >/dev/null
  echo "bucket created: $bucket"
fi

mc version enable "$alias_name/$bucket" >/dev/null
echo "versioning: $(mc version info "$alias_name/$bucket" | tail -1)"

# Anonymous access must stay off. `none` is the default; set it explicitly so a
# later accidental change is visible as a drift.
mc anonymous set none "$alias_name/$bucket" >/dev/null 2>&1 || true
echo "anonymous policy: $(mc anonymous get "$alias_name/$bucket" 2>&1 | tail -1)"

policy_file=$(mktemp)
trap 'rm -f "$policy_file"' EXIT
cat > "$policy_file" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketLocation",
        "s3:ListBucket",
        "s3:ListBucketMultipartUploads"
      ],
      "Resource": ["arn:aws:s3:::$bucket"]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": ["arn:aws:s3:::$bucket/*"]
    }
  ]
}
JSON

mc admin policy create "$alias_name" "$policy" "$policy_file" >/dev/null 2>&1 \
  || mc admin policy update "$alias_name" "$policy" "$policy_file" >/dev/null
echo "policy applied: $policy (scoped to $bucket only)"

secret_key=$(openssl rand -base64 36 | tr -d '\n/+=' | cut -c1-40)
mc admin user add "$alias_name" "$user" "$secret_key" >/dev/null
mc admin policy attach "$alias_name" "$policy" --user "$user" >/dev/null 2>&1 || true

kubectl -n "$namespace" delete secret evidence-minio --ignore-not-found >/dev/null
kubectl -n "$namespace" create secret generic evidence-minio \
  --from-literal=access-key-id="$user" \
  --from-literal=secret-access-key="$secret_key" >/dev/null
unset secret_key
echo "kubernetes secret created: $namespace/evidence-minio (keys: access-key-id, secret-access-key)"

mc alias remove "$alias_name" >/dev/null
echo "done"
