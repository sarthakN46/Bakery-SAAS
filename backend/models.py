import datetime
from typing import List, Optional
from sqlmodel import SQLModel, Field, Relationship

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    email: Optional[str] = Field(default=None, index=True)
    google_id: Optional[str] = Field(default=None, index=True)
    hashed_password: Optional[str] = Field(default=None)

class Ingredient(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    quantity: float  # Current stock level
    unit: str        # e.g., "g", "ml", "unit"
    cost_per_unit: float  # Cost per single unit (e.g. price per 1g, 1ml, or 1 unit)
    user_id: int = Field(foreign_key="user.id")

class RecipeIngredient(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    recipe_id: int = Field(foreign_key="recipe.id")
    ingredient_id: int = Field(foreign_key="ingredient.id")
    quantity_required: float

class Recipe(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    selling_price: float
    user_id: int = Field(foreign_key="user.id")

class ProductionBatch(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    recipe_id: int = Field(foreign_key="recipe.id")
    quantity_produced: float
    quantity_wasted: float = Field(default=0.0)
    cost_of_production: float  # Cost of ingredients used at the time of production
    date: datetime.date = Field(default_factory=datetime.date.today)
    user_id: int = Field(foreign_key="user.id")

class Sale(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    recipe_id: int = Field(foreign_key="recipe.id")
    quantity_sold: float
    revenue: float
    date: datetime.date = Field(default_factory=datetime.date.today)
    user_id: int = Field(foreign_key="user.id")

class Expense(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    amount: float
    category: str  # e.g., "Fixed", "Variable", "Utilities", "Labor", "Rent"
    date: datetime.date = Field(default_factory=datetime.date.today)
    user_id: int = Field(foreign_key="user.id")
