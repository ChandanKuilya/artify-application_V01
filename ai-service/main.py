# from fastapi import FastAPI
# from pydantic import BaseModel
# import spacy

# # Load the pre-trained NLP model we downloaded
# try:
#     nlp = spacy.load("en_core_web_sm")
# except OSError:
#     print("Downloading 'en_core_web_sm' model...")
#     from spacy.cli import download
#     download("en_core_web_sm")
#     nlp = spacy.load("en_core_web_sm")

# # Initialize our FastAPI application
# app = FastAPI()

# # Define the structure of the incoming request data using Pydantic
# # This gives us automatic data validation
# class ProductInfo(BaseModel):
#     name: str
#     description: str

# # Define a root endpoint for health checks
# @app.get("/")
# def read_root():
#     return {"message": "Artify AI Service is running"}

# # Define the main endpoint for generating tags
# @app.post("/generate-tags/")
# def generate_tags(product: ProductInfo):
#     """
#     Generates descriptive tags from product text.
#     This simple implementation uses spaCy to identify nouns and proper nouns.
#     """
#     text_to_process = f"{product.name}. {product.description}"
#     doc = nlp(text_to_process)

#     # Extract nouns and proper nouns as potential tags.
#     # We also filter for relevance (length > 3) and remove duplicates.
#     tags = list(set([
#         token.text.lower() 
#         for token in doc 
#         if token.pos_ in ["NOUN", "PROPN"] and len(token.text) > 3
#     ]))

#     # Return the top 10 most relevant tags
#     return {"tags": tags[:10]}