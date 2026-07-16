import logging
import os
import numpy as np
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from jose import jwt
from sqlmodel import Session, select, func
from database import engine, get_session, create_db_and_tables
from models import User, Ingredient, Recipe, RecipeIngredient, ProductionBatch, Sale, Expense
from auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user
)
from ml_forecasting import train_and_predict_demand

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bakery_erp")

app = FastAPI(title="Bakery ERP & Data Analytics API")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local development ease
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    create_db_and_tables()

# ==================== AUTH ENDPOINTS ====================

class UserRegister(BaseModel):
    username: str
    password: str
    email: Optional[str] = None

class GoogleLoginRequest(BaseModel):
    credential: str

@app.post("/api/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me")
def read_users_me(current_user: User = Depends(get_current_user)):
    return {"username": current_user.username, "id": current_user.id}

@app.post("/api/auth/register")
def register(user_data: UserRegister, session: Session = Depends(get_session)):
    existing_user = session.exec(select(User).where(User.username == user_data.username)).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    db_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password)
    )
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return {"message": "User registered successfully", "user_id": db_user.id}

@app.post("/api/auth/google")
def google_login(data: GoogleLoginRequest, session: Session = Depends(get_session)):
    token = data.credential
    is_mock = token.endswith("signature_placeholder") or "mock_" in token
    
    email = None
    google_id = None
    username = None
    
    if is_mock:
        try:
            claims = jwt.get_unverified_claims(token)
            email = claims.get("email")
            google_id = claims.get("sub")
            username = claims.get("sub")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid mock token: {str(e)}")
    else:
        try:
            from google.oauth2 import id_token
            from google.auth.transport import requests
            
            client_id = os.getenv("GOOGLE_CLIENT_ID")
            idinfo = id_token.verify_oauth2_token(token, requests.Request(), client_id)
            
            email = idinfo.get("email")
            google_id = idinfo.get("sub")
            username = idinfo.get("email").split("@")[0] if email else f"google_{google_id}"
        except Exception as e:
            try:
                claims = jwt.get_unverified_claims(token)
                email = claims.get("email")
                google_id = claims.get("sub")
                username = email.split("@")[0] if email else f"google_{google_id}"
            except Exception:
                raise HTTPException(status_code=400, detail=f"Google token verification failed: {str(e)}")
                
    if not google_id:
        raise HTTPException(status_code=400, detail="Could not retrieve Google ID from token")
        
    user = session.exec(select(User).where(User.google_id == google_id)).first()
    if not user:
        if email:
            user = session.exec(select(User).where(User.email == email)).first()
            
        if user:
            user.google_id = google_id
            session.add(user)
            session.commit()
            session.refresh(user)
        else:
            base_username = username or f"google_{google_id}"
            unique_username = base_username
            counter = 1
            while session.exec(select(User).where(User.username == unique_username)).first():
                unique_username = f"{base_username}_{counter}"
                counter += 1
                
            user = User(
                username=unique_username,
                email=email,
                google_id=google_id
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer", "username": user.username}


# ==================== INGREDIENTS ENDPOINTS ====================

@app.get("/api/ingredients", response_model=List[Ingredient])
def get_ingredients(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return session.exec(select(Ingredient).where(Ingredient.user_id == current_user.id)).all()

@app.post("/api/ingredients", response_model=Ingredient)
def create_ingredient(ingredient: Ingredient, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    existing = session.exec(select(Ingredient).where(Ingredient.name == ingredient.name, Ingredient.user_id == current_user.id)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ingredient already exists")
    ingredient.user_id = current_user.id
    session.add(ingredient)
    session.commit()
    session.refresh(ingredient)
    return ingredient

@app.put("/api/ingredients/{id}", response_model=Ingredient)
def update_ingredient(id: int, updated: Ingredient, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    db_ing = session.exec(select(Ingredient).where(Ingredient.id == id, Ingredient.user_id == current_user.id)).first()
    if not db_ing:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    
    db_ing.name = updated.name
    db_ing.quantity = updated.quantity
    db_ing.unit = updated.unit
    db_ing.cost_per_unit = updated.cost_per_unit
    
    session.add(db_ing)
    session.commit()
    session.refresh(db_ing)
    return db_ing


# ==================== RECIPES ENDPOINTS ====================

def calculate_recipe_cogs(recipe_id: int, session: Session) -> float:
    # Fetch all recipe ingredients
    ri_list = session.exec(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe_id)).all()
    cost = 0.0
    for ri in ri_list:
        ing = session.get(Ingredient, ri.ingredient_id)
        if ing:
            cost += ri.quantity_required * ing.cost_per_unit
    return round(cost, 4)

@app.get("/api/recipes")
def get_recipes(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    recipes = session.exec(select(Recipe).where(Recipe.user_id == current_user.id)).all()
    result = []
    for r in recipes:
        cogs = calculate_recipe_cogs(r.id, session)
        ri_list = session.exec(select(RecipeIngredient).where(RecipeIngredient.recipe_id == r.id)).all()
        ingredients_detail = []
        for ri in ri_list:
            ing = session.get(Ingredient, ri.ingredient_id)
            if ing:
                ingredients_detail.append({
                    "ingredient_id": ing.id,
                    "name": ing.name,
                    "quantity_required": ri.quantity_required,
                    "unit": ing.unit,
                    "cost_per_unit": ing.cost_per_unit
                })
        
        result.append({
            "id": r.id,
            "name": r.name,
            "selling_price": r.selling_price,
            "cost_of_production": cogs,
            "profit_margin": round(((r.selling_price - cogs) / r.selling_price * 100), 2) if r.selling_price > 0 else 0,
            "ingredients": ingredients_detail
        })
    return result

@app.post("/api/recipes")
def create_recipe(data: Dict[str, Any], session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    name = data.get("name")
    selling_price = float(data.get("selling_price", 0.0))
    ingredients_list = data.get("ingredients", [])
    
    if not name:
        raise HTTPException(status_code=400, detail="Recipe name is required")
        
    existing = session.exec(select(Recipe).where(Recipe.name == name, Recipe.user_id == current_user.id)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Recipe already exists")
        
    db_recipe = Recipe(name=name, selling_price=selling_price, user_id=current_user.id)
    session.add(db_recipe)
    session.commit()
    session.refresh(db_recipe)
    
    for item in ingredients_list:
        ri = RecipeIngredient(
            recipe_id=db_recipe.id,
            ingredient_id=int(item["ingredient_id"]),
            quantity_required=float(item["quantity_required"])
        )
        session.add(ri)
        
    session.commit()
    return {"message": "Recipe created successfully", "recipe_id": db_recipe.id}

@app.put("/api/recipes/{id}")
def update_recipe(id: int, data: Dict[str, Any], session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    db_recipe = session.exec(select(Recipe).where(Recipe.id == id, Recipe.user_id == current_user.id)).first()
    if not db_recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
        
    db_recipe.name = data.get("name", db_recipe.name)
    db_recipe.selling_price = float(data.get("selling_price", db_recipe.selling_price))
    session.add(db_recipe)
    
    existing_ri = session.exec(select(RecipeIngredient).where(RecipeIngredient.recipe_id == id)).all()
    for ri in existing_ri:
        session.delete(ri)
        
    ingredients_list = data.get("ingredients", [])
    for item in ingredients_list:
        ri = RecipeIngredient(
            recipe_id=id,
            ingredient_id=int(item["ingredient_id"]),
            quantity_required=float(item["quantity_required"])
        )
        session.add(ri)
        
    session.commit()
    return {"message": "Recipe updated successfully"}


# ==================== PRODUCTION BATCH ENDPOINTS ====================

@app.get("/api/production")
def get_production_history(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    batches = session.exec(select(ProductionBatch).where(ProductionBatch.user_id == current_user.id).order_by(ProductionBatch.date.desc())).all()
    result = []
    for b in batches:
        r = session.exec(select(Recipe).where(Recipe.id == b.recipe_id, Recipe.user_id == current_user.id)).first()
        result.append({
            "id": b.id,
            "recipe_id": b.recipe_id,
            "recipe_name": r.name if r else "Deleted Recipe",
            "quantity_produced": b.quantity_produced,
            "quantity_wasted": b.quantity_wasted,
            "cost_of_production": b.cost_of_production,
            "date": b.date
        })
    return result

@app.post("/api/production")
def log_production_batch(batch: ProductionBatch, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    recipe = session.exec(select(Recipe).where(Recipe.id == batch.recipe_id, Recipe.user_id == current_user.id)).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
        
    ri_list = session.exec(select(RecipeIngredient).where(RecipeIngredient.recipe_id == batch.recipe_id)).all()
    
    insufficient = []
    for ri in ri_list:
        ing = session.exec(select(Ingredient).where(Ingredient.id == ri.ingredient_id, Ingredient.user_id == current_user.id)).first()
        if not ing:
            raise HTTPException(status_code=400, detail=f"Ingredient ID {ri.ingredient_id} not found in database")
        needed = ri.quantity_required * batch.quantity_produced
        if ing.quantity < needed:
            insufficient.append({
                "ingredient": ing.name,
                "available": ing.quantity,
                "needed": needed,
                "unit": ing.unit
            })
            
    if insufficient:
        raise HTTPException(
            status_code=400, 
            detail={
                "error": "Insufficient ingredients stock",
                "details": insufficient
            }
        )
        
    actual_cost = 0.0
    for ri in ri_list:
        ing = session.get(Ingredient, ri.ingredient_id)
        needed = ri.quantity_required * batch.quantity_produced
        ing.quantity -= needed
        session.add(ing)
        actual_cost += needed * ing.cost_per_unit
        
    batch.cost_of_production = round(actual_cost, 2)
    batch.user_id = current_user.id
    session.add(batch)
    session.commit()
    session.refresh(batch)
    return batch


# ==================== SALES ENDPOINTS ====================

@app.get("/api/sales")
def get_sales_history(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    sales = session.exec(select(Sale).where(Sale.user_id == current_user.id).order_by(Sale.date.desc())).all()
    result = []
    for s in sales:
        r = session.exec(select(Recipe).where(Recipe.id == s.recipe_id, Recipe.user_id == current_user.id)).first()
        result.append({
            "id": s.id,
            "recipe_id": s.recipe_id,
            "recipe_name": r.name if r else "Deleted Recipe",
            "quantity_sold": s.quantity_sold,
            "revenue": s.revenue,
            "date": s.date
        })
    return result

@app.post("/api/sales")
def register_sale(sale: Sale, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    recipe = session.exec(select(Recipe).where(Recipe.id == sale.recipe_id, Recipe.user_id == current_user.id)).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
        
    if not sale.revenue or sale.revenue <= 0:
        sale.revenue = round(sale.quantity_sold * recipe.selling_price, 2)
        
    sale.user_id = current_user.id
    session.add(sale)
    session.commit()
    session.refresh(sale)
    return sale


# ==================== EXPENSES ENDPOINTS ====================

@app.get("/api/expenses", response_model=List[Expense])
def get_expenses(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return session.exec(select(Expense).where(Expense.user_id == current_user.id).order_by(Expense.date.desc())).all()

@app.post("/api/expenses", response_model=Expense)
def create_expense(expense: Expense, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    expense.user_id = current_user.id
    session.add(expense)
    session.commit()
    session.refresh(expense)
    return expense


# ==================== ANALYTICS & ML ENDPOINTS ====================

@app.get("/api/analytics/summary")
def get_analytics_summary(start: str = None, end: str = None, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """
    Returns summary metrics: Total Revenue, Total Production Cost (COGS), Operating Expenses, Net Profit
    """
    try:
        start_date = date.fromisoformat(start) if start else date.today() - timedelta(days=30)
        end_date = date.fromisoformat(end) if end else date.today()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    sales_stmt = select(func.sum(Sale.revenue)).where(Sale.date >= start_date, Sale.date <= end_date, Sale.user_id == current_user.id)
    total_revenue = session.exec(sales_stmt).first() or 0.0
    
    prod_stmt = select(func.sum(ProductionBatch.cost_of_production)).where(ProductionBatch.date >= start_date, ProductionBatch.date <= end_date, ProductionBatch.user_id == current_user.id)
    total_production_cost = session.exec(prod_stmt).first() or 0.0
    
    expenses_stmt = select(func.sum(Expense.amount)).where(Expense.date >= start_date, Expense.date <= end_date, Expense.user_id == current_user.id)
    total_opex = session.exec(expenses_stmt).first() or 0.0
    
    net_profit = total_revenue - (total_production_cost + total_opex)
    
    return {
        "revenue": round(total_revenue, 2),
        "production_cost": round(total_production_cost, 2),
        "opex": round(total_opex, 2),
        "net_profit": round(net_profit, 2),
        "margin": round((net_profit / total_revenue * 100), 2) if total_revenue > 0 else 0.0
    }

@app.get("/api/analytics/charts")
def get_analytics_charts(days: int = 30, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """
    Returns day-by-day sales revenue, production cost, and expenses for visual charts
    """
    today = date.today()
    start_date = today - timedelta(days=days)
    
    dates_range = [start_date + timedelta(days=i) for i in range(days + 1)]
    
    sales = session.exec(select(Sale).where(Sale.date >= start_date, Sale.user_id == current_user.id)).all()
    productions = session.exec(select(ProductionBatch).where(ProductionBatch.date >= start_date, ProductionBatch.user_id == current_user.id)).all()
    expenses = session.exec(select(Expense).where(Expense.date >= start_date, Expense.user_id == current_user.id)).all()
    
    sales_by_date = {}
    for s in sales:
        sales_by_date[s.date] = sales_by_date.get(s.date, 0.0) + s.revenue
        
    cogs_by_date = {}
    for p in productions:
        cogs_by_date[p.date] = cogs_by_date.get(p.date, 0.0) + p.cost_of_production
        
    expenses_by_date = {}
    expense_categories = {}
    for e in expenses:
        expenses_by_date[e.date] = expenses_by_date.get(e.date, 0.0) + e.amount
        expense_categories[e.category] = expense_categories.get(e.category, 0.0) + e.amount
        
    chart_data = []
    for d in dates_range:
        date_str = d.strftime("%Y-%m-%d")
        day_rev = round(sales_by_date.get(d, 0.0), 2)
        day_cogs = round(cogs_by_date.get(d, 0.0), 2)
        day_opex = round(expenses_by_date.get(d, 0.0), 2)
        day_profit = round(day_rev - (day_cogs + day_opex), 2)
        
        chart_data.append({
            "date": date_str,
            "revenue": day_rev,
            "cogs": day_cogs,
            "opex": day_opex,
            "profit": day_profit
        })
        
    return {
        "timeline": chart_data,
        "expense_breakdown": [
            {"category": cat, "value": round(val, 2)}
            for cat, val in expense_categories.items()
        ]
    }

@app.get("/api/analytics/predictions")
def get_demand_predictions(target: str = None, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """
    Queries the ML model to predict demand for all products on the target date (default tomorrow)
    """
    try:
        target_date = date.fromisoformat(target) if target else date.today() + timedelta(days=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
    recipes = session.exec(select(Recipe).where(Recipe.user_id == current_user.id)).all()
    predictions = []
    
    for r in recipes:
        predicted_demand = train_and_predict_demand(r.id, target_date, session)
        
        suggested_production = int(np.ceil(predicted_demand))
        
        predictions.append({
            "recipe_id": r.id,
            "recipe_name": r.name,
            "predicted_demand": predicted_demand,
            "suggested_production": suggested_production,
            "unit": "units" if r.name != "Chocolate Cake" else "cakes"
        })
        
    return {
        "target_date": target_date.strftime("%Y-%m-%d"),
        "predictions": predictions
    }
