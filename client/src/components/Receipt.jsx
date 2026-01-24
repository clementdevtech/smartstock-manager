const Receipt = React.forwardRef(({ cart, total }, ref) => (
  <div ref={ref} className="p-4 text-sm w-72">
    <h2 className="text-center font-bold">SmartStock</h2>
    <hr />
    {cart.map((i) => (
      <div key={i.item} className="flex justify-between">
        <span>{i.name} × {i.quantity}</span>
        <span>{i.total.toFixed(2)}</span>
      </div>
    ))}
    <hr />
    <div className="font-bold text-right">Total: {total}</div>
  </div>
));

export default Receipt;
