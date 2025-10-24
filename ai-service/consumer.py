import json
import spacy
import psycopg2
import time
from kafka import KafkaConsumer

# --- CONFIGURATION ---
KAFKA_TOPIC = 'product-created'
KAFKA_BROKER = 'localhost:9092'

# --- IMPORTANT: Use your actual DB password ---
DB_NAME = 'artify_db'
DB_USER = 'artify__user'
DB_PASS = 'your_secure_password' # <-- PUT YOUR DB PASSWORD HERE
DB_HOST = 'localhost'
DB_PORT = '5432'

# --- 1. Load NLP Model ---
print("Loading spaCy NLP model...")
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    print("Model not found. Downloading 'en_core_web_sm'...")
    from spacy.cli import download
    download("en_core_web_sm")
    nlp = spacy.load("en_core_web_sm")
print("NLP model loaded.")

# --- 2. Define Helper Functions ---

def generate_tags(name, description):
    """Generates tags from product text."""
    # Ensure inputs are strings
    name = str(name) if name else ""
    description = str(description) if description else ""
    
    text = f"{name}. {description}"
    doc = nlp(text)
    tags = list(set([
        token.text.lower() 
        for token in doc 
        if token.pos_ in ["NOUN", "PROPN"] and len(token.text) > 3
    ]))
    return tags[:10]

def update_product_in_db(product_id, tags):
    """Connects to Postgres and updates a product with new tags."""
    conn = None
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            host=DB_HOST,
            port=DB_PORT
        )
        cur = conn.cursor()
        
        # Execute the UPDATE statement
        cur.execute(
            "UPDATE products SET tags = %s WHERE id = %s",
            (tags, product_id)
        )
        
        conn.commit() # Commit the transaction
        cur.close()
        print(f"Successfully tagged product ID: {product_id} with tags: {tags}")
        
    except Exception as e:
        print(f"Error updating database for product ID {product_id}: {e}")
    finally:
        if conn:
            conn.close()

# --- 3. Main Consumer Loop ---
print("Attempting to connect to Kafka...")

# Retry connection to Kafka
consumer = None
while not consumer:
    try:
        consumer = KafkaConsumer(
            KAFKA_TOPIC,
            bootstrap_servers=KAFKA_BROKER,
            auto_offset_reset='earliest', # Process messages from the beginning
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            group_id='tagging-service' # So Kafka remembers where we left off
        )
    except Exception as e:
        print(f"Kafka connection failed: {e}. Retrying in 5 seconds...")
        time.sleep(5)

print("Kafka Consumer connected successfully! Listening for messages...")

for message in consumer:
    # message.value is the product data (a dictionary)
    product = message.value
    product_id = product.get('id')
    
    if not product_id:
        print("Received message with no ID. Skipping.")
        continue
        
    print(f"\nReceived product for tagging: ID {product_id}, Name: {product['name']}")
    
    # 1. Generate tags
    tags = generate_tags(product.get('name'), product.get('description'))
    
    # 2. Update database
    if tags:
        update_product_in_db(product_id, tags)
    else:
        print(f"No tags generated for product ID: {product_id}")

