import pandas as pd
import numpy as np
from datetime import datetime, timedelta, date
from sqlmodel import Session, select
from sklearn.ensemble import RandomForestRegressor
from models import Sale, Recipe
import logging

logger = logging.getLogger("bakery_ml")

def train_and_predict_demand(recipe_id: int, target_date: date, session: Session) -> float:
    """
    Trains a machine learning model (Random Forest Regressor) or uses a fallback 
    moving average model to predict the demand of a specific product on a given target date.
    
    Features engineered:
    - day_of_week (0-6)
    - month (1-12)
    - day_of_month (1-31)
    """
    # 1. Fetch all sales for this recipe
    statement = select(Sale).where(Sale.recipe_id == recipe_id).order_by(Sale.date)
    sales = session.exec(statement).all()
    
    if not sales:
        return 0.0
        
    # Convert database objects to Pandas DataFrame
    data = []
    for s in sales:
        data.append({
            "date": pd.to_datetime(s.date),
            "quantity": s.quantity_sold
        })
        
    df = pd.DataFrame(data)
    
    # Aggregate sales by date in case there are multiple sales entries per day
    df = df.groupby("date")["quantity"].sum().reset_index()
    df = df.sort_values("date")
    
    # 2. Check if we have enough historical data to train an ML model
    # We require at least 14 days of data to extract meaningful patterns (like day of week)
    if len(df) < 14:
        # Fallback: Return a simple moving average of the last 7 entries (or fewer if not available)
        recent_sales = df["quantity"].tail(7)
        predicted_val = float(recent_sales.mean())
        logger.info(f"[ML Forecast] Insufficient data ({len(df)} days). Using 7-day moving average. Predicted: {predicted_val:.2f}")
        return round(predicted_val, 1)
        
    # 3. Feature Engineering for ML Model
    df["day_of_week"] = df["date"].dt.dayofweek
    df["month"] = df["date"].dt.month
    df["day"] = df["date"].dt.day
    
    # Create lag features (e.g. sales 1 day ago, 7 days ago)
    # We fill missing values with the median of the sales
    df["lag_1"] = df["quantity"].shift(1)
    df["lag_7"] = df["quantity"].shift(7)
    df["lag_1"] = df["lag_1"].fillna(df["quantity"].median())
    df["lag_7"] = df["lag_7"].fillna(df["quantity"].median())
    
    # Features & Target
    feature_cols = ["day_of_week", "month", "day", "lag_1", "lag_7"]
    X = df[feature_cols]
    y = df["quantity"]
    
    # Train the Random Forest Regressor
    model = RandomForestRegressor(n_estimators=50, random_state=42)
    model.fit(X, y)
    
    # 4. Prepare target date features for prediction
    target_dt = pd.to_datetime(target_date)
    target_day_of_week = target_dt.dayofweek
    target_month = target_dt.month
    target_day = target_dt.day
    
    # For prediction, we need lag values relative to target date
    # lag_1: quantity sold 1 day before target date
    # lag_7: quantity sold 7 days before target date
    date_1_day_ago = target_dt - timedelta(days=1)
    date_7_days_ago = target_dt - timedelta(days=7)
    
    # Lookup values in historical df
    val_1_day_ago = df[df["date"] == date_1_day_ago]["quantity"].values
    val_7_days_ago = df[df["date"] == date_7_days_ago]["quantity"].values
    
    lag_1_val = float(val_1_day_ago[0]) if len(val_1_day_ago) > 0 else float(df["quantity"].median())
    lag_7_val = float(val_7_days_ago[0]) if len(val_7_days_ago) > 0 else float(df["quantity"].median())
    
    X_pred = pd.DataFrame([{
        "day_of_week": target_day_of_week,
        "month": target_month,
        "day": target_day,
        "lag_1": lag_1_val,
        "lag_7": lag_7_val
    }])
    
    # Make prediction
    predicted_val = float(model.predict(X_pred)[0])
    
    # Ensure prediction is non-negative
    predicted_val = max(0.0, predicted_val)
    
    logger.info(f"[ML Forecast] Trained RF model. Predicted for {target_date}: {predicted_val:.2f}")
    return round(predicted_val, 1)
