import random
from datetime import datetime, timedelta, date
# pyrefly: ignore [missing-import]
from sqlmodel import Session, select
from database import engine, create_db_and_tables
from models import User, Ingredient, Recipe, RecipeIngredient, ProductionBatch, Sale, Expense
from auth import get_password_hash

def seed_database():
    # 1. Create tables
    create_db_and_tables()
    
    with Session(engine) as session:
        # Check if already seeded
        existing_user = session.exec(select(User).where(User.username == "admin")).first()
        if existing_user:
            print("Database already seeded.")
            return

        print("Seeding database with owner user and 30 days of historical bakery data...")

        # 2. Create admin user
        admin_user = User(
            username="admin",
            hashed_password=get_password_hash("admin123")
        )
        session.add(admin_user)
        session.commit() # Commit to guarantee ID is assigned

        # Retrieve admin user to get database ID
        admin_user = session.exec(select(User).where(User.username == "admin")).first()
        admin_id = admin_user.id

        # 3. Create ingredients
        ingredients_data = [
            {"name": "Flour", "quantity": 100000.0, "unit": "g", "cost_per_unit": 0.001},      # $1.00 / kg
            {"name": "Sugar", "quantity": 50000.0, "unit": "g", "cost_per_unit": 0.0015},      # $1.50 / kg
            {"name": "Butter", "quantity": 30000.0, "unit": "g", "cost_per_unit": 0.008},      # $8.00 / kg
            {"name": "Yeast", "quantity": 5000.0, "unit": "g", "cost_per_unit": 0.02},         # $20.00 / kg
            {"name": "Milk", "quantity": 40000.0, "unit": "ml", "cost_per_unit": 0.0012},      # $1.20 / L
            {"name": "Eggs", "quantity": 500.0, "unit": "unit", "cost_per_unit": 0.25},        # $0.25 each
            {"name": "Chocolate", "quantity": 20000.0, "unit": "g", "cost_per_unit": 0.012},   # $12.00 / kg
        ]
        
        ingredients_db = {}
        for ing in ingredients_data:
            db_ing = Ingredient(**ing, user_id=admin_id)
            session.add(db_ing)
            ingredients_db[ing["name"]] = db_ing
        
        # Flush to get ingredient IDs
        session.flush()

        # 4. Create recipes
        recipes_data = [
            {"name": "Chocolate Cake", "selling_price": 25.0},
            {"name": "Butter Croissant", "selling_price": 3.50},
            {"name": "Sourdough Bread", "selling_price": 6.00},
        ]
        
        recipes_db = {}
        for r in recipes_data:
            db_recipe = Recipe(**r, user_id=admin_id)
            session.add(db_recipe)
            recipes_db[r["name"]] = db_recipe

        session.commit()

        # 5. Link ingredients to recipes (RecipeIngredient)
        recipe_ingredients_data = {
            "Chocolate Cake": [
                {"ing": "Flour", "qty": 200.0},
                {"ing": "Sugar", "qty": 150.0},
                {"ing": "Butter", "qty": 100.0},
                {"ing": "Chocolate", "qty": 150.0},
                {"ing": "Eggs", "qty": 4.0},
            ],
            "Butter Croissant": [
                {"ing": "Flour", "qty": 100.0},
                {"ing": "Butter", "qty": 50.0},
                {"ing": "Sugar", "qty": 10.0},
                {"ing": "Yeast", "qty": 5.0},
                {"ing": "Milk", "qty": 30.0},
            ],
            "Sourdough Bread": [
                {"ing": "Flour", "qty": 400.0},
                {"ing": "Yeast", "qty": 10.0},
            ],
        }

        # Calculate production costs for logging
        cogs = {}
        for recipe_name, recipe_ings in recipe_ingredients_data.items():
            recipe = recipes_db[recipe_name]
            total_cost = 0.0
            for item in recipe_ings:
                ing = ingredients_db[item["ing"]]
                ri = RecipeIngredient(
                    recipe_id=recipe.id,
                    ingredient_id=ing.id,
                    quantity_required=item["qty"]
                )
                session.add(ri)
                total_cost += item["qty"] * ing.cost_per_unit
            cogs[recipe.id] = total_cost

        session.commit()

        # 6. Generate historical sales, production, and expenses for past 30 days
        today = date.today()
        start_date = today - timedelta(days=30)
        
        # Fixed Expense (Rent: $1000 logged at start)
        rent_expense = Expense(
            name="Monthly Bakery Rent",
            amount=1000.0,
            category="Rent",
            date=start_date,
            user_id=admin_id
        )
        session.add(rent_expense)

        current_date = start_date
        while current_date <= today:
            # Determine sales patterns based on day of week (weekend bump)
            day_of_week = current_date.weekday() # 0 = Monday, 6 = Sunday
            is_weekend = day_of_week in [5, 6]
            multiplier = 1.5 if is_weekend else 1.0
            
            # Weekly utilities expense on every Monday
            if day_of_week == 0:
                electricity = Expense(
                    name="Weekly Electricity & Water",
                    amount=float(random.randint(120, 180)),
                    category="Utilities",
                    date=current_date,
                    user_id=admin_id
                )
                session.add(electricity)
                
            # Bi-weekly staff salary
            if (current_date - start_date).days % 14 == 0:
                salary = Expense(
                    name="Staff Bi-weekly Salary",
                    amount=600.0,
                    category="Labor",
                    date=current_date,
                    user_id=admin_id
                )
                session.add(salary)

            for recipe_name, recipe in recipes_db.items():
                # Define base sales quantity
                if recipe_name == "Chocolate Cake":
                    base_sales = random.randint(4, 8)
                elif recipe_name == "Butter Croissant":
                    base_sales = random.randint(25, 45)
                else: # Sourdough Bread
                    base_sales = random.randint(10, 20)
                    
                sales_qty = int(base_sales * multiplier)
                
                # Production batch is usually slightly higher than sales (baking in morning)
                # Some are wasted (unsold items)
                waste_qty = random.choice([0, 0, 1, 2]) if recipe_name != "Chocolate Cake" else random.choice([0, 0, 0, 1])
                production_qty = sales_qty + waste_qty
                
                # Add production batch
                prod_cost = production_qty * cogs[recipe.id]
                batch = ProductionBatch(
                    recipe_id=recipe.id,
                    quantity_produced=float(production_qty),
                    quantity_wasted=float(waste_qty),
                    cost_of_production=round(prod_cost, 2),
                    date=current_date,
                    user_id=admin_id
                )
                session.add(batch)
                
                # Add sales entry
                revenue = sales_qty * recipe.selling_price
                sale = Sale(
                    recipe_id=recipe.id,
                    quantity_sold=float(sales_qty),
                    revenue=round(revenue, 2),
                    date=current_date,
                    user_id=admin_id
                )
                session.add(sale)

            current_date += timedelta(days=1)

        session.commit()
        print("Database seeded successfully!")

if __name__ == "__main__":
    seed_database()
