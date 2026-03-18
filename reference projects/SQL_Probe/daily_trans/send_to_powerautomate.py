#!/usr/bin/env python3
"""
Script to send HTML report file to Power Automate via HTTP webhook.
"""
import argparse
import base64
import os
import re
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library not found. Install it with: pip install requests", file=sys.stderr)
    sys.exit(1)

# Default Power Automate webhook URL (can be overridden via environment variable or command line)
DEFAULT_WEBHOOK_URL = os.environ.get('POWER_AUTOMATE_WEBHOOK_URL', 
    'https://default8b194f6d59c94b4287861c626d1ec2.e6.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/a38ca15b93a14fbc828548f238c01a72/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=fYpVDxg9Ky55mHwgPlHPS3ngg7qVoIMV9Dx0tJf9_9s')


def get_image_mime_type(image_path: str) -> str:
    """Determine MIME type based on file extension."""
    ext = os.path.splitext(image_path)[1].lower()
    mime_types = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp'
    }
    return mime_types.get(ext, 'image/png')


def embed_images_in_html(html_content: str, html_dir: str) -> str:
    """
    Embed referenced images as base64 data URIs in HTML content.
    
    Args:
        html_content: The HTML content as a string
        html_dir: Directory where the HTML file is located (for resolving relative paths)
    
    Returns:
        HTML content with embedded images
    """
    # Find all img tags with src attributes
    img_pattern = r'<img\s+([^>]*src=["\']([^"\']+)["\'][^>]*)>'
    
    def replace_image(match):
        full_match = match.group(0)
        attributes = match.group(1)
        src_path = match.group(2)
        
        # Skip if already a data URI
        if src_path.startswith('data:'):
            return full_match
        
        # Resolve image path
        if not os.path.isabs(src_path):
            image_path = os.path.join(html_dir, src_path)
        else:
            image_path = src_path
        
        # Check if image exists
        if not os.path.exists(image_path):
            print(f"Warning: Image not found: {image_path}, keeping original reference")
            return full_match
        
        # Read and encode image
        try:
            with open(image_path, 'rb') as img_file:
                image_data = img_file.read()
                image_base64 = base64.b64encode(image_data).decode('utf-8')
                mime_type = get_image_mime_type(image_path)
                data_uri = f"data:{mime_type};base64,{image_base64}"
                
                # Replace src in attributes
                new_attributes = re.sub(
                    r'src=["\'][^"\']+["\']',
                    f'src="{data_uri}"',
                    attributes
                )
                return f'<img {new_attributes}>'
        except Exception as e:
            print(f"Warning: Failed to embed image {image_path}: {e}, keeping original reference")
            return full_match
    
    # Replace all image references
    embedded_html = re.sub(img_pattern, replace_image, html_content)
    return embedded_html


def send_to_powerautomate(html_file_path, webhook_url=None):
    """
    Send HTML file to Power Automate webhook.
    
    Args:
        html_file_path: Path to HTML file to send
        webhook_url: Power Automate webhook URL (or None to use environment variable)
    
    Returns:
        True if successful, False otherwise
    """
    # Get webhook URL from default, environment variable, or argument
    if not webhook_url:
        webhook_url = DEFAULT_WEBHOOK_URL
        if not webhook_url:
            print("ERROR: Webhook URL not provided and POWER_AUTOMATE_WEBHOOK_URL environment variable not set", file=sys.stderr)
            print("Either provide --webhook-url argument, set POWER_AUTOMATE_WEBHOOK_URL environment variable, or update DEFAULT_WEBHOOK_URL in script", file=sys.stderr)
            return False
    
    # Check if file exists
    if not os.path.exists(html_file_path):
        print(f"ERROR: HTML file not found: {html_file_path}", file=sys.stderr)
        return False
    
    # Read HTML file as text (UTF-8)
    try:
        with open(html_file_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
    except Exception as e:
        print(f"ERROR: Failed to read HTML file: {e}", file=sys.stderr)
        return False
    
    # Embed images (like logo) as base64 data URIs
    html_dir = os.path.dirname(os.path.abspath(html_file_path))
    html_content = embed_images_in_html(html_content, html_dir)
    
    # Get filename
    filename = os.path.basename(html_file_path)
    
    # Base64 encode the HTML content (encode string to bytes first, then base64)
    html_bytes = html_content.encode('utf-8')
    html_base64 = base64.b64encode(html_bytes).decode('utf-8')
    
    # Prepare JSON payload according to Power Automate schema
    # Note: Field names are lowercase: "filename" and "content"
    payload = {
        "filename": filename,
        "content": html_base64
    }
    
    # Ensure content is not None/empty
    if not html_base64 or not filename:
        print(f"ERROR: Missing required data - filename: {filename}, content length: {len(html_base64) if html_base64 else 0}", file=sys.stderr)
        return False
    
    # Send to Power Automate
    try:
        print(f"Reading HTML file: {html_file_path}")
        print(f"Sending to Power Automate...")
        
        response = requests.post(
            webhook_url,
            json=payload,
            headers={
                "Content-Type": "application/json"
            },
            timeout=30
        )
        
        response.raise_for_status()
        
        print(f"Success! Status code: {response.status_code}")
        if response.text:
            print(f"Response: {response.text}")
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Failed to send to Power Automate: {e}", file=sys.stderr)
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response status: {e.response.status_code}", file=sys.stderr)
            print(f"Response text: {e.response.text[:500]}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"ERROR: Unexpected error: {e}", file=sys.stderr)
        return False


def main():
    """Main function."""
    parser = argparse.ArgumentParser(
        description="Send HTML report file to Power Automate",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Send file using environment variable for webhook URL
  python send_to_powerautomate.py --html-file report.html

  # Send file with explicit webhook URL
  python send_to_powerautomate.py --html-file report.html --webhook-url https://prod-xxx.webhook.office.com/...

Environment Variables:
  POWER_AUTOMATE_WEBHOOK_URL - Power Automate webhook URL (if not provided via --webhook-url)
        """
    )
    
    parser.add_argument(
        '--html-file',
        required=True,
        help='Path to HTML file to send'
    )
    parser.add_argument(
        '--webhook-url',
        help='Power Automate webhook URL (or use POWER_AUTOMATE_WEBHOOK_URL env var)'
    )
    
    args = parser.parse_args()
    
    # Resolve file path
    html_path = args.html_file
    if not os.path.isabs(html_path):
        html_path = os.path.abspath(html_path)
    
    # Send to Power Automate
    success = send_to_powerautomate(html_path, args.webhook_url)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

